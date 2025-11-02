import { Button } from "@/components/ui/button";
import StepHeader from "./StepHeader";
import { useRestaurantConfig } from "@/contexts/RestaurantConfigContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Phone } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface GuestsStepProps {
  onNext: (guests: number, withChildren: boolean) => void;
  onBack: () => void;
  onStepClick?: (step: "date" | "guests" | "time") => void;
  selectedDate?: Date;
}

const GuestsStep = ({ onNext, onBack, onStepClick, selectedDate }: GuestsStepProps) => {
  const { config } = useRestaurantConfig();
  const guestOptions = [1, 2, 3, 4, 5, 6, 7, 8];
  const [withChildren, setWithChildren] = useState(false);

  const handleGuestSelection = (guests: number) => {
    if (guests === 1) {
      alert("Para reservas de 1 persona contacta en el teléfono del restaurante");
      return;
    }
    onNext(guests, withChildren);
  };

  {
    /* Alerta para reservas de 1 persona */
  }
  <Alert className="mb-6 border-blue-200 bg-blue-50">
    <Phone className="h-4 w-4 text-blue-600" />
    <AlertDescription className="text-blue-800">
      <strong>Reservas de 1 persona:</strong> Contacta directamente al restaurante por teléfono
    </AlertDescription>
  </Alert>;

  return (
    <div className="max-w-lg mx-auto">
      <StepHeader currentStep="guests" selectedDate={selectedDate} onStepClick={onStepClick} />

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-medium text-primary mb-6">¿Cuántos sois?</h2>

        {/* Checkbox para niños */}
        <div className="flex items-center space-x-2 mb-6 p-4 bg-gray-50 rounded-lg border ">
          <Checkbox
            id="withChildren"
            checked={withChildren}
            onCheckedChange={(checked) => setWithChildren(checked as boolean)}
            className="border-primary data-[state=checked]:bg-primary"
          />
          <Label htmlFor="withChildren" className="text-sm font-medium text-gray-700 cursor-pointer">
            ¿Vienes con niños?
          </Label>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-8">
          {guestOptions.map((guests) => (
            <Button
              key={guests}
              variant="outline"
              className="h-16 text-lg font-medium hover:bg-primary hover:text-white"
              onClick={() => handleGuestSelection(guests)}
            >
              {guests}
            </Button>
          ))}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium  mb-2">¿Grupo de más de 8 personas?</p>
          <p className="text-xs mb-3">Para reservas de grupos grandes, contáctanos directamente:</p>
          <a
            href={`tel:${config?.contact_phone ?? "+34123456789"}`}
            className="inline-flex items-center gap-2 text-sm font-medium  hover:text-gray-900 underline text-primary"
          >
            <Phone className="w-4 h-4" />
            Llamar al restaurante
          </a>
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" onClick={onBack} className="text-primary">
            ← Volver
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
    </div>
  );
};

export default GuestsStep;
