import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantConfig } from "@/contexts/RestaurantConfigContext";
import { useNavigate } from "react-router-dom";
import StepHeader from "./StepHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmationStepProps {
  reservation: {
    id: string;
    date: string;
    time: string;
    guests: number;
    customer: {
      name: string;
      phone: string;
    };
    zones?: string[];
  };
  onBack: () => void;
}

const ConfirmationStep = ({ reservation, onBack }: ConfirmationStepProps) => {
  const { config } = useRestaurantConfig();
  const navigate = useNavigate();
  const [cancelPhone, setCancelPhone] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [foundReservation, setFoundReservation] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const { toast } = useToast();

  const handleSearchReservation = async () => {
    if (!cancelPhone) {
      toast({
        title: "Error",
        description: "Por favor ingresa tu número de teléfono",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      // Normalizar el número de teléfono (eliminar espacios y otros caracteres no numéricos)
      const normalizedPhone = cancelPhone.replace(/\s+/g, "").replace(/[^\d]/g, "");
      // console.log("Buscando reservas para el número normalizado:", normalizedPhone);

      // Método 1: Buscar cliente por teléfono
      const { data: customers, error: customerError } = await supabase
        .from("customers")
        .select("id, name, phone")
        .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%,phone.ilike.%${normalizedPhone.slice(-9)}%`);

      if (customerError) {
        console.error("Error al buscar clientes:", customerError);
        throw customerError;
      }

      // console.log("Clientes encontrados:", customers);

      // Recopilar todos los IDs de clientes que coincidan
      const customerIds = customers?.map((c) => c.id) || [];

      // Método 2: Buscar directamente todas las reservas futuras
      const today = new Date().toISOString().split("T")[0];

      // Consulta para obtener todas las reservas futuras
      const { data: allFutureReservations, error: allReservationsError } = await supabase
        .from("reservations")
        .select(
          `
          id, 
          date, 
          time, 
          guests, 
          status,
          customer_id,
          customers(id, name, phone, email)
        `
        )
        .gte("date", today)
        .in("status", ["pending", "confirmed", "seated"]);

      if (allReservationsError) {
        console.error("Error al buscar todas las reservas:", allReservationsError);
        throw allReservationsError;
      }

      // console.log("Todas las reservas futuras:", allFutureReservations);

      // Filtrar reservas que coincidan con el número de teléfono (ya sea por ID de cliente o por teléfono en la tabla de clientes)
      const matchingReservations = allFutureReservations?.filter((reservation) => {
        // Si tenemos IDs de clientes que coinciden, verificar si esta reserva pertenece a alguno de ellos
        if (customerIds.length > 0 && customerIds.includes(reservation.customer_id)) {
          return true;
        }

        // También verificar si el teléfono del cliente asociado a la reserva coincide
        const customerPhone = reservation.customers?.phone || "";
        const normalizedCustomerPhone = customerPhone.replace(/\s+/g, "").replace(/[^\d]/g, "");

        return (
          normalizedCustomerPhone.includes(normalizedPhone) ||
          normalizedPhone.includes(normalizedCustomerPhone) ||
          normalizedCustomerPhone.includes(normalizedPhone.slice(-9)) ||
          normalizedPhone.slice(-9).includes(normalizedCustomerPhone)
        );
      });

      // console.log("Reservas coincidentes:", matchingReservations);

      if (!matchingReservations || matchingReservations.length === 0) {
        toast({
          title: "No se encontraron reservas",
          description: "No hay reservas activas para este número de teléfono",
          variant: "destructive",
        });
        setIsSearching(false);
        return;
      }

      // Use the first active reservation found
      const firstReservation = matchingReservations[0];
      setFoundReservation({
        ...firstReservation,
        customerName: firstReservation.customers?.name || "Cliente",
      });
    } catch (error) {
      console.error("Error searching reservation:", error);
      toast({
        title: "Error",
        description: "Ocurrió un error al buscar la reserva. Intenta de nuevo.",
        variant: "destructive",
      });
    }
    setIsSearching(false);
  };

  const handleCancelReservation = async () => {
    if (!foundReservation) return;

    setIsCancelling(true);
    try {
      // Cancel the reservation
      const { error: updateError } = await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", foundReservation.id);

      if (updateError) throw updateError;

      toast({
        title: "Reserva cancelada",
        description: "Tu reserva ha sido cancelada exitosamente",
      });

      setCancelPhone("");
      setFoundReservation(null);
      setShowCancelDialog(false);
    } catch (error) {
      console.error("Error canceling reservation:", error);
      toast({
        title: "Error",
        description: "No se pudo cancelar la reserva. Intenta de nuevo.",
        variant: "destructive",
      });
    }
    setIsCancelling(false);
  };

  const handleConsultarCarta = () => {
    navigate("/carta");
  };

  const formatDate = (dateString: string) => {
    const [y, m, d] = dateString.split("-");
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString("es-ES", {
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (timeString: string) => {
    return timeString.slice(0, 5);
  };

  return (
    <div className="max-w-lg mx-auto">
      <StepHeader currentStep="confirmation" />

      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <div className="mb-8">
          <p className="text-lg mb-4">
            <strong>{reservation.customer.name}</strong>, tu reserva para el día{" "}
            <strong>{formatDate(reservation.date)}</strong> a las <strong>{formatTime(reservation.time)}</strong> para{" "}
            <strong>
              {reservation.guests} {reservation.guests === 1 ? "persona" : "personas"}
            </strong>{" "}
            está confirmada.
          </p>
        </div>

        {/* Mensajes informativos */}
        <div className="mb-6 bg-gray-100 border border-gray-300 rounded-lg p-4">
          <div className="space-y-2 text-left">
            {/* Mensaje obligatorio para todas las reservas */}
            <p className="text-sm text-gray-800 font-medium">El horario de llegada es de obligado cumplimiento.</p>

            {/* Mensaje para turnos de 13:30 o 13:45 */}
            {(reservation.time === "13:30:00" ||
              reservation.time === "13:30" ||
              reservation.time === "13:45:00" ||
              reservation.time === "13:45") && (
              <p className="text-sm text-gray-800">Dispones de un turno de 90 minutos.</p>
            )}

            {/* Mensaje para reservas en terraza */}
            {reservation.zones &&
              reservation.zones.some(
                (zone) => zone.toLowerCase().includes("terraza") || zone.toLowerCase().includes("exterior")
              ) && (
                <p className="text-sm text-gray-800">Si llueve, no podemos garantizar el cambio a una mesa interior.</p>
              )}
          </div>
        </div>

        {/* Botones principales */}
        <div className="flex flex-col space-y-3 mb-6">
          <Button onClick={handleConsultarCarta} className="w-full bg-primary hover:bg-primary/90 text-white py-3">
            Consulta nuestra carta
          </Button>

          <Button
            onClick={() => setShowCancelDialog(true)}
            variant="outline"
            className="w-full border-gray-500 text-gray-500 hover:bg-gray-50 py-3"
          >
            Cancelar reserva
          </Button>

          <Button
            onClick={onBack}
            variant="outline"
            className="w-full border-primary text-primary hover:bg-primary/10 py-3"
          >
            Hacer nueva reserva
          </Button>
        </div>
        
        {/* Developer Credit */}
        <div className="mt-8 text-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          <span className="text-xs text-muted-foreground/60">
            Desarrollado por{" "}
          </span>
          <a 
            href="https://www.gridded.agency" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-black hover:underline"
          >
            GriddedAgency
          </a>
        </div>
      </div>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cancelar reserva</DialogTitle>
            <DialogDescription>Introduce tu número de teléfono para buscar y cancelar tu reserva.</DialogDescription>
          </DialogHeader>

          {!foundReservation ? (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="phone" className="text-right col-span-1">
                  Teléfono
                </label>
                <div className="col-span-3">
                  <div className="flex">
                    <span className="inline-flex items-center px-3 text-sm text-gray-900 bg-gray-200 border border-r-0 border-gray-300 rounded-l-md">
                      +34
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      value={cancelPhone}
                      onChange={(e) => setCancelPhone(e.target.value)}
                      className="rounded-l-none"
                      placeholder="Ej. 612345678"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" onClick={handleSearchReservation} disabled={isSearching}>
                  {isSearching ? "Buscando..." : "Buscar reserva"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-4">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-medium mb-2">Reserva encontrada:</h4>
                <p>
                  <strong>Cliente:</strong> {foundReservation.customerName}
                </p>
                <p>
                  <strong>Fecha:</strong> {formatDate(foundReservation.date)}
                </p>
                <p>
                  <strong>Hora:</strong> {formatTime(foundReservation.time)}
                </p>
                <p>
                  <strong>Personas:</strong> {foundReservation.guests}
                </p>
              </div>
              <p className="text-red-500 text-sm mb-4">
                ¿Estás seguro de que deseas cancelar esta reserva? Esta acción no se puede deshacer.
              </p>
              <DialogFooter className="flex justify-between">
                <Button variant="outline" onClick={() => setFoundReservation(null)}>
                  Volver
                </Button>
                <Button variant="destructive" onClick={handleCancelReservation} disabled={isCancelling}>
                  {isCancelling ? "Cancelando..." : "Confirmar cancelación"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfirmationStep;
