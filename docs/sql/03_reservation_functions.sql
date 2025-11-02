-- ========================================
-- FUNCIONES DE RESERVAS - VERSIÓN COMPLETA Y ACTUALIZADA
-- ========================================
-- Última actualización: 2025-11-01
-- 
-- ESTRUCTURA DEL ARCHIVO:
-- 
-- PARTE 1: FUNCIONES INTERNAS DEL SISTEMA
--   1. assign_tables_to_reservation - Asignación automática de mesas
--   2. create_reservation_with_assignment - Crear reserva con asignación
--   3. get_available_time_slots_with_zones - Obtener slots disponibles
--   4. get_available_tables_for_reservation - Mesas disponibles para admin
--
-- PARTE 2: FUNCIONES DE API PÚBLICA (para agentes externos)
--   5. public_find_reservation - Buscar reservas por teléfono
--   6. public_cancel_reservation - Cancelar reserva
--   7. public_create_reservation - Crear reserva con zona preferida opcional
--
-- CAMBIOS RECIENTES:
-- ✅ public_create_reservation ahora incluye p_preferred_zone_id (opcional)
-- ✅ Validaciones de campos obligatorios mejoradas
-- ✅ Normalización con trim() de todos los campos text
-- ✅ Funciones de API reorganizadas al final del archivo
--
-- ========================================

-- ========================================
-- FUNCIÓN 1: assign_tables_to_reservation
-- ========================================
-- Asigna mesas automáticamente a una reserva
-- Lógica: Por cada zona (prioridad), buscar mesa individual, luego combinación
-- ========================================

DROP FUNCTION IF EXISTS assign_tables_to_reservation(uuid, date, timestamptz, timestamptz, integer, uuid);

CREATE OR REPLACE FUNCTION assign_tables_to_reservation(
    p_reservation_id uuid,
    p_date date,
    p_start_at timestamptz,
    p_end_at timestamptz,
    p_guests integer,
    p_preferred_zone_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assigned_tables uuid[] := ARRAY[]::uuid[];
    v_table_id uuid;
    v_combination record;
    v_zone record;
BEGIN
    -- Iterar por cada zona en orden de prioridad
    FOR v_zone IN
        SELECT z.id, z.priority_order
        FROM public.zones z
        WHERE z.is_active = true
          AND (p_preferred_zone_id IS NULL OR z.id = p_preferred_zone_id)
        ORDER BY 
            CASE WHEN z.id = p_preferred_zone_id THEN 0 ELSE 1 END,
            z.priority_order ASC
    LOOP
        -- Estrategia 1: Buscar UNA MESA individual que cubra la capacidad en esta zona
        SELECT t.id INTO v_table_id
        FROM public.tables t
        WHERE t.is_active = true
          AND t.zone_id = v_zone.id
          AND t.capacity >= p_guests
          AND is_table_available(t.id, p_date, p_start_at, p_end_at, NULL)
        ORDER BY t.capacity ASC  -- Mesa más pequeña que cubra
        LIMIT 1;
        
        IF FOUND THEN
            -- Asignar esta mesa
            INSERT INTO public.reservation_table_assignments (reservation_id, table_id)
            VALUES (p_reservation_id, v_table_id);
            
            RETURN ARRAY[v_table_id];
        END IF;
        
        -- Estrategia 2: Buscar COMBINACIÓN en esta zona
        FOR v_combination IN
            SELECT tc.id, tc.table_ids, tc.total_capacity
            FROM public.table_combinations tc
            WHERE tc.is_active = true
              AND tc.zone_id = v_zone.id
              AND tc.total_capacity >= p_guests
              -- Verificar que todas las mesas están disponibles
              AND NOT EXISTS (
                  SELECT 1
                  FROM UNNEST(tc.table_ids) AS combo_table_id
                  WHERE NOT is_table_available(combo_table_id, p_date, p_start_at, p_end_at, NULL)
              )
            ORDER BY tc.total_capacity ASC  -- Combinación más pequeña que cubra
            LIMIT 1
        LOOP
            -- Asignar todas las mesas de la combinación
            FOREACH v_table_id IN ARRAY v_combination.table_ids
            LOOP
                INSERT INTO public.reservation_table_assignments (reservation_id, table_id)
                VALUES (p_reservation_id, v_table_id);
                
                v_assigned_tables := array_append(v_assigned_tables, v_table_id);
            END LOOP;
            
            RETURN v_assigned_tables;
        END LOOP;
    END LOOP;
    
    -- Si no se encontró nada, devolver array vacío
    RETURN ARRAY[]::uuid[];
    
EXCEPTION
    WHEN OTHERS THEN
        -- En caso de error, limpiar asignaciones
        DELETE FROM public.reservation_table_assignments 
        WHERE reservation_id = p_reservation_id;
        
        RAISE EXCEPTION 'Error al asignar mesas: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_tables_to_reservation(uuid, date, timestamptz, timestamptz, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_tables_to_reservation(uuid, date, timestamptz, timestamptz, integer, uuid) TO service_role;

COMMENT ON FUNCTION assign_tables_to_reservation IS 'Asigna mesas automáticamente: por zona, primero mesa individual, luego combinación';

-- ========================================
-- FUNCIÓN 2: create_reservation_with_assignment
-- ========================================
-- Crea una reserva y asigna mesas automáticamente
-- Incluye validaciones de horarios y disponibilidad
-- ========================================

DROP FUNCTION IF EXISTS create_reservation_with_assignment(uuid, date, time, integer, text, integer, uuid);

CREATE OR REPLACE FUNCTION create_reservation_with_assignment(
    p_customer_id uuid,
    p_date date,
    p_time time,
    p_guests integer,
    p_special_requests text DEFAULT NULL,
    p_duration_minutes integer DEFAULT 90,
    p_preferred_zone_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reservation_id uuid;
    v_start_at timestamptz;
    v_end_at timestamptz;
    v_assigned_tables uuid[];
    v_day_of_week integer;
    v_special_closed boolean;
    v_special_schedule record;
    v_schedule_exists boolean;
    v_diners_check json;
BEGIN
    v_day_of_week := EXTRACT(DOW FROM p_date);
    
    -- Verificar si el restaurante está cerrado ese día
    SELECT COUNT(*) > 0 INTO v_special_closed
    FROM public.special_closed_days scd
    WHERE (
        (NOT scd.is_range AND scd.date = p_date) OR
        (scd.is_range AND p_date BETWEEN scd.range_start AND scd.range_end)
    );

    IF v_special_closed THEN
        RETURN json_build_object('success', false, 'error', 'Restaurant is closed on selected date');
    END IF;

    -- Verificar horarios especiales
    SELECT opening_time, closing_time INTO v_special_schedule
    FROM public.special_schedule_days 
    WHERE date = p_date AND is_active = true
    LIMIT 1;

    IF FOUND THEN
        IF p_time < v_special_schedule.opening_time OR p_time > v_special_schedule.closing_time THEN
            RETURN json_build_object('success', false, 'error', 'Restaurant is closed at selected time');
        END IF;
    ELSE
        -- Verificar horarios regulares
        SELECT COUNT(*) > 0 INTO v_schedule_exists
        FROM public.restaurant_schedules 
        WHERE day_of_week = v_day_of_week AND is_active = true
          AND p_time >= opening_time AND p_time <= closing_time;
        IF NOT v_schedule_exists THEN
            RETURN json_build_object('success', false, 'error', 'Restaurant is closed at selected time');
        END IF;
    END IF;

    -- Verificar límite de comensales
    SELECT check_diners_limit(p_date, p_time, p_guests) INTO v_diners_check;
    IF (v_diners_check->>'success')::boolean = false THEN
        RETURN v_diners_check;
    END IF;

    -- Calcular timestamps con la duración especificada
    v_start_at := (p_date::text || ' ' || p_time::text)::timestamp AT TIME ZONE 'Europe/Madrid';
    v_end_at := v_start_at + (p_duration_minutes || ' minutes')::interval;

    -- Crear la reserva
    INSERT INTO public.reservations (customer_id, date, time, guests, status, special_requests, start_at, end_at, duration_minutes)
    VALUES (p_customer_id, p_date, p_time, p_guests, 'confirmed', p_special_requests, v_start_at, v_end_at, p_duration_minutes)
    RETURNING id INTO v_reservation_id;

    -- Asignar mesas automáticamente
    SELECT assign_tables_to_reservation(v_reservation_id, p_date, v_start_at, v_end_at, p_guests, p_preferred_zone_id)
    INTO v_assigned_tables;

    -- Verificar si se asignaron mesas
    IF v_assigned_tables IS NULL OR cardinality(v_assigned_tables) = 0 THEN
        DELETE FROM public.reservations WHERE id = v_reservation_id;
        RETURN json_build_object(
            'success', false,
            'error', 'No hay mesas disponibles para esta capacidad en el horario solicitado'
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Reserva creada exitosamente',
        'reservation_id', v_reservation_id,
        'assigned_tables', v_assigned_tables
    );
    
EXCEPTION
    WHEN OTHERS THEN
        IF v_reservation_id IS NOT NULL THEN
            DELETE FROM public.reservations WHERE id = v_reservation_id;
        END IF;
        RETURN json_build_object(
            'success', false,
            'error', 'Error al crear la reserva: ' || SQLERRM
        );
END;
$$;

GRANT EXECUTE ON FUNCTION create_reservation_with_assignment(uuid, date, time, integer, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_reservation_with_assignment(uuid, date, time, integer, text, integer, uuid) TO service_role;

COMMENT ON FUNCTION create_reservation_with_assignment IS 'Crea reserva con asignación automática de mesas. Duración por defecto: 90 minutos';

-- ========================================
-- FUNCIÓN 3: get_available_time_slots_with_zones
-- ========================================
-- Obtiene slots disponibles con información de zona
-- ========================================

DROP FUNCTION IF EXISTS get_available_time_slots_with_zones(date, integer, integer);

CREATE OR REPLACE FUNCTION get_available_time_slots_with_zones(
    p_date date,
    p_guests integer,
    p_duration_minutes integer DEFAULT 120
)
RETURNS TABLE(slot_time time, zone_name text, zone_id uuid)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_day_of_week integer;
BEGIN
    v_day_of_week := EXTRACT(DOW FROM p_date);
    
    RETURN QUERY
    WITH slot_times AS (
        SELECT ts.time as slot_time
        FROM public.time_slots ts
        WHERE EXISTS (
            SELECT 1 FROM public.restaurant_schedules rs
            WHERE rs.day_of_week = v_day_of_week 
              AND rs.is_active = true
              AND ts.time >= rs.opening_time 
              -- ✅ <= para INCLUIR el último slot configurado
              AND ts.time <= rs.closing_time
        )
    ),
    slot_ranges AS (
        SELECT 
            st.slot_time,
            ((p_date::text || ' ' || st.slot_time::text)::timestamp AT TIME ZONE 'Europe/Madrid') as start_at,
            ((p_date::text || ' ' || st.slot_time::text)::timestamp AT TIME ZONE 'Europe/Madrid') + (p_duration_minutes || ' minutes')::interval as end_at
        FROM slot_times st
    ),
    occupied_tables AS (
        SELECT DISTINCT
            sr.slot_time,
            rta.table_id
        FROM slot_ranges sr
        CROSS JOIN public.reservations r
        INNER JOIN public.reservation_table_assignments rta ON r.id = rta.reservation_id
        WHERE r.date = p_date
          AND r.status IN ('confirmed', 'arrived')
          AND r.start_at < sr.end_at 
          AND r.end_at > sr.start_at
    ),
    available_tables AS (
        SELECT 
            sr.slot_time,
            t.id as table_id,
            t.capacity,
            COALESCE(z.name, 'Sin zona') as zone_name,
            COALESCE(z.priority_order, 999) as zone_priority,
            z.id as zone_id
        FROM slot_ranges sr
        CROSS JOIN public.tables t
        LEFT JOIN public.zones z ON t.zone_id = z.id
        WHERE t.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM occupied_tables ot
              WHERE ot.slot_time = sr.slot_time
                AND ot.table_id = t.id
          )
    ),
    available_combinations AS (
        SELECT 
            sr.slot_time,
            tc.id as combination_id,
            tc.total_capacity as capacity,
            COALESCE(z.name, 'Sin zona') as zone_name,
            COALESCE(z.priority_order, 999) as zone_priority,
            z.id as zone_id
        FROM slot_ranges sr
        CROSS JOIN public.table_combinations tc
        LEFT JOIN public.zones z ON tc.zone_id = z.id
        WHERE tc.is_active = true
          -- ✅ Usar UNNEST del array table_ids
          AND NOT EXISTS (
              SELECT 1 
              FROM UNNEST(tc.table_ids) AS combo_table_id
              WHERE EXISTS (
                  SELECT 1 FROM occupied_tables ot
                  WHERE ot.slot_time = sr.slot_time
                    AND ot.table_id = combo_table_id
              )
          )
    ),
    all_options AS (
        SELECT at.slot_time, at.capacity, at.zone_name, at.zone_priority, at.zone_id 
        FROM available_tables at
        UNION ALL
        SELECT ac.slot_time, ac.capacity, ac.zone_name, ac.zone_priority, ac.zone_id 
        FROM available_combinations ac
    ),
    available_zones_per_slot AS (
        SELECT DISTINCT ON (ao.slot_time, ao.zone_name)
            ao.slot_time,
            ao.zone_name,
            ao.zone_priority,
            ao.zone_id
        FROM all_options ao
        WHERE ao.capacity >= p_guests
        ORDER BY ao.slot_time, ao.zone_name, ao.zone_priority ASC, ao.capacity ASC
    )
    SELECT azps.slot_time, azps.zone_name, azps.zone_id
    FROM available_zones_per_slot azps
    ORDER BY azps.slot_time, azps.zone_priority ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_time_slots_with_zones(date, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION get_available_time_slots_with_zones(date, integer, integer) TO authenticated;

COMMENT ON FUNCTION get_available_time_slots_with_zones IS 'Obtiene TODOS los slots disponibles con TODAS las zonas disponibles para cada horario';

=======



-- ========================================
-- FUNCIÓN 4: get_available_tables_for_reservation
-- ========================================
-- Obtiene mesas disponibles para el admin (con opción de excluir reserva en edición)
-- ========================================

-- Eliminar ambas versiones existentes (con y sin p_exclude_reservation_id)
DROP FUNCTION IF EXISTS get_available_tables_for_reservation(date, time, integer);
DROP FUNCTION IF EXISTS get_available_tables_for_reservation(date, time, integer, uuid);

CREATE OR REPLACE FUNCTION get_available_tables_for_reservation(
    p_date date,
    p_time time,
    p_duration_minutes integer DEFAULT 90,
    p_exclude_reservation_id uuid DEFAULT NULL
)
RETURNS TABLE(
    table_id uuid,
    table_name text,
    capacity integer,
    extra_capacity integer,
    total_capacity integer,
    zone_id uuid,
    zone_name text,
    zone_color text,
    is_available boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_start_at timestamptz;
    v_end_at timestamptz;
BEGIN
    -- Calcular timestamps
    v_start_at := (p_date::text || ' ' || p_time::text)::timestamp AT TIME ZONE 'Europe/Madrid';
    v_end_at := v_start_at + (p_duration_minutes || ' minutes')::interval;
    
    RETURN QUERY
    WITH occupied_tables AS (
        SELECT DISTINCT rta.table_id
        FROM public.reservations r
        INNER JOIN public.reservation_table_assignments rta ON r.id = rta.reservation_id
        WHERE r.date = p_date
          AND r.status IN ('confirmed', 'arrived')
          AND r.start_at < v_end_at 
          AND r.end_at > v_start_at
          -- Excluir la reserva actual si estamos editando
          AND (p_exclude_reservation_id IS NULL OR r.id != p_exclude_reservation_id)
    )
    SELECT 
        t.id as table_id,
        t.name as table_name,
        t.capacity,
        COALESCE(t.extra_capacity, 0) as extra_capacity,
        t.capacity + COALESCE(t.extra_capacity, 0) as total_capacity,
        z.id as zone_id,
        COALESCE(z.name, 'Sin zona') as zone_name,
        z.color as zone_color,
        NOT EXISTS (
            SELECT 1 FROM occupied_tables ot
            WHERE ot.table_id = t.id
        ) as is_available
    FROM public.tables t
    LEFT JOIN public.zones z ON t.zone_id = z.id
    WHERE t.is_active = true
    ORDER BY z.priority_order ASC NULLS LAST, t.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_tables_for_reservation(date, time, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_tables_for_reservation(date, time, integer, uuid) TO service_role;

COMMENT ON FUNCTION get_available_tables_for_reservation IS 'Obtiene todas las mesas con su disponibilidad para el admin (modo manual)';


-- ========================================
-- ========================================
-- PARTE 2: FUNCIONES DE API PÚBLICA
-- ========================================
-- ========================================
-- Las siguientes funciones están diseñadas para ser consumidas
-- por agentes externos (chatbots, asistentes de IA, etc.)
-- ========================================


-- ========================================
-- FUNCIÓN 5: public_find_reservation
-- ========================================
-- Busca reservas activas/futuras por teléfono
-- ========================================

DROP FUNCTION IF EXISTS public_find_reservation(text);

CREATE OR REPLACE FUNCTION public_find_reservation(p_phone text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result json;
BEGIN
    WITH reservations_data AS (
        SELECT 
            r.id,
            r.date,
            r.time,
            r.guests,
            r.status,
            c.name as customer_name
        FROM public.reservations r
        JOIN public.customers c ON r.customer_id = c.id
        WHERE c.phone = p_phone
          AND r.status IN ('confirmed', 'arrived')
          -- ✅ Mostrar solo reservas que aún no han terminado
          AND r.end_at > NOW()
        ORDER BY r.date, r.time
    )
    SELECT json_build_object(
        'success', true,
        'reservations', json_agg(
            json_build_object(
                'id', rd.id,
                'date', rd.date,
                'time', rd.time,
                'guests', rd.guests,
                'status', rd.status,
                'customer_name', rd.customer_name
            )
        )
    )
    INTO v_result
    FROM reservations_data rd;

    RETURN COALESCE(v_result, json_build_object('success', true, 'reservations', '[]'::json));
END;
$$;

GRANT EXECUTE ON FUNCTION public_find_reservation TO anon;
GRANT EXECUTE ON FUNCTION public_find_reservation TO authenticated;

COMMENT ON FUNCTION public_find_reservation IS 'API pública: Busca reservas activas/futuras por teléfono';


-- ========================================
-- FUNCIÓN 6: public_cancel_reservation
-- ========================================
-- Cancela una reserva por teléfono y fecha
-- ========================================

DROP FUNCTION IF EXISTS public_cancel_reservation(text, date, time, text);

CREATE OR REPLACE FUNCTION public_cancel_reservation(
    p_phone text,
    p_date date,
    p_time time DEFAULT NULL,
    p_reason text DEFAULT 'Cancelada por el cliente'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reservation_id uuid;
    v_customer_id uuid;
BEGIN
    -- Buscar la reserva
    SELECT r.id, r.customer_id INTO v_reservation_id, v_customer_id
    FROM public.reservations r
    JOIN public.customers c ON r.customer_id = c.id
    WHERE c.phone = p_phone
      AND r.date = p_date
      AND (p_time IS NULL OR r.time = p_time)
      AND r.status IN ('confirmed', 'arrived')
    ORDER BY r.time
    LIMIT 1;

    IF v_reservation_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se encontró una reserva activa para este teléfono y fecha'
        );
    END IF;

    -- Cancelar la reserva
    UPDATE public.reservations
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = v_reservation_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Reserva cancelada exitosamente',
        'reservation_id', v_reservation_id
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Error al cancelar la reserva: ' || SQLERRM
        );
END;
$$;

GRANT EXECUTE ON FUNCTION public_cancel_reservation TO anon;
GRANT EXECUTE ON FUNCTION public_cancel_reservation TO authenticated;

COMMENT ON FUNCTION public_cancel_reservation IS 'API pública: Cancela reserva por teléfono y fecha';


-- ========================================
-- FUNCIÓN 7: public_create_reservation
-- ========================================
-- Crea una reserva desde la API pública con zona preferida opcional
-- ========================================

DROP FUNCTION IF EXISTS public_create_reservation(text, text, date, time, integer, text, integer, text, uuid);

CREATE OR REPLACE FUNCTION public_create_reservation(
    p_name text,
    p_phone text,
    p_date date,
    p_time time,
    p_guests integer,
    p_email text DEFAULT NULL,
    p_duration_minutes integer DEFAULT 90,
    p_special_requests text DEFAULT NULL,
    p_preferred_zone_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_id uuid;
    v_result json;
BEGIN
    -- Validar datos obligatorios
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El nombre del cliente es obligatorio'
        );
    END IF;
    
    IF p_phone IS NULL OR trim(p_phone) = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El teléfono del cliente es obligatorio'
        );
    END IF;
    
    -- Buscar o crear cliente
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE phone = trim(p_phone);

    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (name, phone, email)
        VALUES (trim(p_name), trim(p_phone), NULLIF(trim(p_email), ''))
        RETURNING id INTO v_customer_id;
    ELSE
        -- Actualizar datos si han cambiado
        UPDATE public.customers
        SET name = CASE WHEN trim(p_name) != '' THEN trim(p_name) ELSE name END,
            email = CASE WHEN p_email IS NOT NULL AND trim(p_email) != '' THEN trim(p_email) ELSE email END,
            updated_at = NOW()
        WHERE id = v_customer_id;
    END IF;

    -- Crear la reserva usando la función interna
    SELECT create_reservation_with_assignment(
        v_customer_id,
        p_date,
        p_time,
        p_guests,
        p_special_requests,
        p_duration_minutes,
        p_preferred_zone_id  -- zona preferida (NULL si no se especifica)
    ) INTO v_result;

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Error al crear la reserva: ' || SQLERRM
        );
END;
$$;

GRANT EXECUTE ON FUNCTION public_create_reservation TO anon;
GRANT EXECUTE ON FUNCTION public_create_reservation TO authenticated;

COMMENT ON FUNCTION public_create_reservation IS 'API pública: Crea reserva con gestión automática de clientes y zona preferida opcional';


-- ========================================
-- FUNCIÓN 7: get_available_tables_for_reservation
-- ========================================
-- Obtiene mesas disponibles para el admin (con opción de excluir reserva en edición)
-- ========================================

-- Eliminar ambas versiones existentes (con y sin p_exclude_reservation_id)
DROP FUNCTION IF EXISTS get_available_tables_for_reservation(date, time, integer);
DROP FUNCTION IF EXISTS get_available_tables_for_reservation(date, time, integer, uuid);

CREATE OR REPLACE FUNCTION get_available_tables_for_reservation(
    p_date date,
    p_time time,
    p_duration_minutes integer DEFAULT 90,
    p_exclude_reservation_id uuid DEFAULT NULL
)
RETURNS TABLE(
    table_id uuid,
    table_name text,
    capacity integer,
    extra_capacity integer,
    total_capacity integer,
    zone_id uuid,
    zone_name text,
    zone_color text,
    is_available boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_start_at timestamptz;
    v_end_at timestamptz;
BEGIN
    -- Calcular timestamps
    v_start_at := (p_date::text || ' ' || p_time::text)::timestamp AT TIME ZONE 'Europe/Madrid';
    v_end_at := v_start_at + (p_duration_minutes || ' minutes')::interval;
    
    RETURN QUERY
    WITH occupied_tables AS (
        SELECT DISTINCT rta.table_id
        FROM public.reservations r
        INNER JOIN public.reservation_table_assignments rta ON r.id = rta.reservation_id
        WHERE r.date = p_date
          AND r.status IN ('confirmed', 'arrived')
          AND r.start_at < v_end_at 
          AND r.end_at > v_start_at
          -- Excluir la reserva actual si estamos editando
          AND (p_exclude_reservation_id IS NULL OR r.id != p_exclude_reservation_id)
    )
    SELECT 
        t.id as table_id,
        t.name as table_name,
        t.capacity,
        COALESCE(t.extra_capacity, 0) as extra_capacity,
        t.capacity + COALESCE(t.extra_capacity, 0) as total_capacity,
        z.id as zone_id,
        COALESCE(z.name, 'Sin zona') as zone_name,
        z.color as zone_color,
        NOT EXISTS (
            SELECT 1 FROM occupied_tables ot
            WHERE ot.table_id = t.id
        ) as is_available
    FROM public.tables t
    LEFT JOIN public.zones z ON t.zone_id = z.id
    WHERE t.is_active = true
    ORDER BY z.priority_order ASC NULLS LAST, t.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_tables_for_reservation(date, time, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_tables_for_reservation(date, time, integer, uuid) TO service_role;

COMMENT ON FUNCTION get_available_tables_for_reservation IS 'Obtiene todas las mesas con su disponibilidad para el admin (modo manual)';

-- ========================================
-- VERIFICACIÓN
-- ========================================

SELECT 'Funciones de reservas instaladas correctamente:' as status;
SELECT '✅ assign_tables_to_reservation' as funcion;
SELECT '✅ create_reservation_with_assignment (duración: 90 min)' as funcion;
SELECT '✅ get_available_time_slots_with_zones (con zone_id)' as funcion;
SELECT '✅ get_available_tables_for_reservation (admin)' as funcion;
SELECT '✅ public_find_reservation (API)' as funcion;
SELECT '✅ public_cancel_reservation (API)' as funcion;
SELECT '✅ public_create_reservation (API con zona preferida)' as funcion;

