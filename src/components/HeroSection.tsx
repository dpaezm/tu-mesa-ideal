import { Button } from "@/components/ui/button";
import { useRestaurantConfig } from "@/contexts/RestaurantConfigContext";
import { useState, useEffect } from "react";
import heroImage from "@/assets/restaurant-hero.jpg";
import HeroSkeleton from "./HeroSkeleton";

const HeroSection = () => {
  const { config, isInitialLoad } = useRestaurantConfig();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [currentImage, setCurrentImage] = useState(heroImage);

  // Preload de la imagen cuando cambie la configuración
  useEffect(() => {
    if (config?.hero_image_url && config.hero_image_url !== currentImage) {
      const img = new Image();
      img.onload = () => {
        setCurrentImage(config.hero_image_url);
        setImageLoaded(true);
      };
      img.onerror = () => {
        // Si falla la carga, usar imagen por defecto
        setCurrentImage(heroImage);
        setImageLoaded(true);
      };
      img.src = config.hero_image_url;
    } else {
      setImageLoaded(true);
    }
  }, [config?.hero_image_url, currentImage]);

  // Mostrar skeleton solo durante la carga inicial
  if (isInitialLoad) {
    return <HeroSkeleton />;
  }

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image con transición suave */}
      <div
        className={`absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 ease-in-out ${
          imageLoaded ? "opacity-100" : "opacity-0"
        }`}
        style={{
          backgroundImage: `url(${currentImage})`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-restaurant-brown/80 via-restaurant-brown/50 to-transparent"></div>
      </div>

      {/* Fallback background durante la carga de imagen */}
      {!imageLoaded && (
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600">
          <div className="absolute inset-0 bg-gradient-to-r from-restaurant-brown/80 via-restaurant-brown/50 to-transparent"></div>
        </div>
      )}

      {/* Hero Content con animación de entrada */}
      <div
        className={`relative z-10 text-center text-white px-4 max-w-4xl mx-auto transition-all duration-700 ease-out ${
          config ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight transition-all duration-500">
          {config?.hero_title || "Reserva tu Mesa"}
        </h1>
        <p className="text-xl md:text-2xl mb-8 text-gray-200 max-w-2xl mx-auto leading-relaxed transition-all duration-500 delay-100">
          {config?.hero_subtitle ||
            "Carnes"}
        </p>
        <div className="transition-all duration-500 delay-200">
          <Button
            variant="reserve"
            size="lg"
            className="animate-slide-up hover:scale-105 transition-transform duration-300"
            onClick={() => {
              // Trigger the start of reservation directly
              const reservationSection = document.getElementById("reservation");
              if (reservationSection) {
                reservationSection.scrollIntoView({ behavior: "smooth" });
                // Wait for scroll then trigger the start button
                setTimeout(() => {
                  const startButton = document.querySelector("[data-start-reservation]") as HTMLButtonElement;
                  if (startButton) {
                    startButton.click();
                  }
                }, 500);
              }
            }}
          >
            Hacer Reserva
          </Button>
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-white animate-bounce">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  );
};

export default HeroSection;
