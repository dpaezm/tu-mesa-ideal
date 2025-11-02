import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import DateStep from "./reservation/DateStep";
import GuestsStep from "./reservation/GuestsStep";
import TimeStep from "./reservation/TimeStep";
import InfoStep from "./reservation/InfoStep";
import ConfirmationStep from "./reservation/ConfirmationStep";
import { format } from "date-fns";

interface ReservationData {
  date: Date;
  time: string;
  guests: number;
}

interface CustomerData {
  fullName: string;
  phone: string;
  comments: string;
}

const ReservationForm = () => {
  const [currentStep, setCurrentStep] = useState<"initial" | "date" | "guests" | "time" | "info" | "confirmation">(
    "initial"
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedGuests, setSelectedGuests] = useState<number>(0);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedZone, setSelectedZone] = useState<string | undefined>(undefined);
  const [selectedZoneId, setSelectedZoneId] = useState<string | undefined>(undefined);
  const [withChildren, setWithChildren] = useState<boolean>(false);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [confirmedReservation, setConfirmedReservation] = useState<any>(null);
  const { toast } = useToast();

  const handleStartReservation = () => {
    setCurrentStep("date");
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCurrentStep("guests");
  };

  const handleGuestsSelect = (guests: number, withChildrenParam: boolean) => {
    setSelectedGuests(guests);
    setWithChildren(withChildrenParam);
    
    // Usar setTimeout para asegurar que el estado se actualice antes de cambiar de paso
    setTimeout(() => {
      setCurrentStep("time");
    }, 0);
  };

  const handleTimeSelect = (time: string, zoneName?: string, zoneId?: string) => {
    setSelectedTime(time);
    setSelectedZone(zoneName);
    setSelectedZoneId(zoneId);
    setCurrentStep("info");
  };

  const handleInfoSubmit = async (customer: CustomerData) => {
    if (!selectedDate || !selectedTime || !selectedGuests) return;

    try {
      setCurrentStep("confirmation");

      // Create customer with optional email using the helper function
      const { data: customerId, error: customerError } = await supabase.rpc("create_customer_optional_email", {
        p_name: customer.fullName,
        p_phone: customer.phone,
        p_email: null, // No email provided
      });

      if (customerError) {
        console.error("Error creating customer:", customerError);

        // Mensajes de error específicos para creación de cliente
        let errorMessage = "Error desconocido al crear el cliente";

        if (customerError.code === "42883") {
          errorMessage = "La función de creación de cliente no existe en la base de datos. Contacta al administrador.";
        } else if (customerError.code === "23505") {
          errorMessage = "Ya existe un cliente con estos datos. Intenta con información diferente.";
        } else if (customerError.message.includes("permission denied")) {
          errorMessage = "No tienes permisos para crear clientes. Contacta al administrador.";
        } else if (customerError.message.includes("function") && customerError.message.includes("does not exist")) {
          errorMessage = "La función de base de datos no está disponible. Contacta al administrador.";
        } else {
          errorMessage = `Error de base de datos al crear cliente: ${customerError.message}`;
        }

        throw new Error(errorMessage);
      }

      if (!customerId) {
        throw new Error("La función de creación de cliente no devolvió un ID válido. Contacta al administrador.");
      }

      const formatDateLocal = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      // Create reservation with table assignment using create_reservation_with_assignment
      const { data: result, error: reservationError } = await supabase.rpc("create_reservation_with_assignment", {
        p_customer_id: customerId,
        p_date: formatDateLocal(selectedDate!),
        p_time: selectedTime,
        p_guests: selectedGuests,
        p_special_requests: customer.comments || null,
        p_duration_minutes: 90,
        p_preferred_zone_id: selectedZoneId || null,
      });

      console.log("🎯 Creando reserva con zona preferida:", selectedZone, "ID:", selectedZoneId);

      if (reservationError) {
        console.error("Supabase reservation error:", reservationError);

        // Mensajes de error específicos para creación de reserva
        let errorMessage = "Error desconocido al crear la reserva";

        if (reservationError.code === "42883") {
          errorMessage = "La función de creación de reservas no existe en la base de datos. Contacta al administrador.";
        } else if (reservationError.message.includes("permission denied")) {
          errorMessage = "No tienes permisos para crear reservas. Contacta al administrador.";
        } else if (
          reservationError.message.includes("function") &&
          reservationError.message.includes("does not exist")
        ) {
          errorMessage = "La función de reservas no está disponible. Contacta al administrador.";
        } else {
          errorMessage = `Error de base de datos al crear reserva: ${reservationError.message}`;
        }

        throw new Error(errorMessage);
      }

      // Check if reservation was successful
      if (!result || typeof result !== "object" || !("success" in result) || !result.success) {
        console.error("Reservation creation failed:", result);

        const errorMessage =
          result && typeof result === "object" && "error" in result
            ? `Error en la lógica de reserva: ${result.error as string}`
            : "La reserva no se pudo procesar correctamente. Verifica disponibilidad e inténtalo de nuevo.";

        throw new Error(errorMessage);
      }

      const resultObj = result as any;
      const reservationId = resultObj.reservation_id;

      // Obtener información de las mesas asignadas con sus zonas
      let tableZones: string[] = [];
      try {
        const { data: tablesData, error: tablesError } = await supabase
          .from("reservation_table_assignments")
          .select(
            `
            table_id,
            tables (
              name,
              zone_id,
              zones (
                name
              )
            )
          `
          )
          .eq("reservation_id", reservationId);

        console.log("🔍 Datos de mesas asignadas:", tablesData);
        console.log("🔍 Error al obtener zonas:", tablesError);

        if (!tablesError && tablesData) {
          tableZones = tablesData
            .map((assignment: any) => {
              console.log("📍 Mesa:", assignment.tables?.name, "Zona:", assignment.tables?.zones?.name);
              return assignment.tables?.zones?.name;
            })
            .filter((zoneName: string | undefined) => zoneName !== undefined);

          console.log("✅ Zonas finales:", tableZones);
        }
      } catch (error) {
        console.error("Error fetching table zones:", error);
      }

      setConfirmedReservation({
        id: reservationId,
        customer: {
          name: customer.fullName,
          phone: customer.phone,
        },
        date: formatDateLocal(selectedDate!),
        time: selectedTime,
        guests: selectedGuests,
        status: "confirmed",
        zones: tableZones,
      });
      setCurrentStep("confirmation");
    } catch (error) {
      console.error("Error creating reservation:", error);
      toast({
        title: "Error al crear la reserva",
        description: error instanceof Error ? error.message : "Error desconocido. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
      // Don't change step on error, stay on info step
      setCurrentStep("info");
    }
  };

  const handleBackToInitial = () => {
    setCurrentStep("initial");
    setSelectedDate(null);
    setSelectedGuests(0);
    setSelectedTime("");
    setSelectedZone(undefined);
    setSelectedZoneId(undefined);
    setWithChildren(false);
    setCustomerData(null);
    setConfirmedReservation(null);
  };

  const handleBack = () => {
    switch (currentStep) {
      case "guests":
        setCurrentStep("date");
        break;
      case "time":
        setCurrentStep("guests");
        break;
      case "info":
        setCurrentStep("time");
        break;
      default:
        setCurrentStep("initial");
    }
  };

  const handleStepClick = (step: "date" | "guests" | "time") => {
    if (step === "date") {
      setCurrentStep("date");
    } else if (step === "guests" && selectedDate) {
      setCurrentStep("guests");
    } else if (step === "time" && selectedDate && selectedGuests > 0) {
      setCurrentStep("time");
    }
  };

  return (
    <section id="reservation" className="py-20 bg-gradient-subtle">
      <div className="container mx-auto px-4">
        {currentStep === "initial" && (
          <>
            <div className="text-center mb-12 animate-fade-in">
              <h2 className="text-4xl font-bold text-restaurant-brown mb-4">Reserva tu Mesa</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Completa el formulario y asegura tu lugar en una experiencia culinaria inolvidable
              </p>
            </div>

            <div className="max-w-2xl mx-auto text-center animate-slide-up">
              <Button
                onClick={handleStartReservation}
                data-start-reservation
                className="bg-primary hover:bg-primary/90 text-white px-8 py-4 rounded-lg text-lg font-medium transition-colors shadow-elegant"
                size="lg"
              >
                Comenzar Reserva
              </Button>
            </div>
          </>
        )}

        {currentStep === "date" && <DateStep onNext={handleDateSelect} onBack={handleBackToInitial} />}

        {currentStep === "guests" && (
          <GuestsStep
            onNext={handleGuestsSelect}
            onBack={handleBack}
            onStepClick={handleStepClick}
            selectedDate={selectedDate || undefined}
          />
        )}

        {currentStep === "time" && (
          <TimeStep
            date={selectedDate!}
            guests={selectedGuests}
            withChildren={withChildren}
            onNext={handleTimeSelect}
            onBack={handleBack}
            onStepClick={handleStepClick}
          />
        )}

        {currentStep === "info" && (
          <InfoStep
            onNext={handleInfoSubmit}
            onBack={handleBack}
            selectedDate={selectedDate}
            selectedGuests={selectedGuests}
            selectedTime={selectedTime}
            withChildren={withChildren}
            onStepClick={handleStepClick}
          />
        )}

        {currentStep === "confirmation" && confirmedReservation && (
          <ConfirmationStep reservation={confirmedReservation} onBack={handleBackToInitial} />
        )}
      </div>
    </section>
  );
};

export default ReservationForm;
