import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Phone, Clock, Star } from "lucide-react";
import { useRestaurantConfig } from "@/contexts/RestaurantConfigContext";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
const RestaurantInfo = () => {
  const { config } = useRestaurantConfig();
  const [schedules, setSchedules] = useState<any[]>([]);

  useEffect(() => {
    const fetchSchedules = async () => {
      const { data } = await supabase
        .from("restaurant_schedules")
        .select("*")
        .eq("is_active", true)
        .order("day_of_week");

      if (data) {
        setSchedules(data);
      }
    };

    fetchSchedules();
  }, []);

  const getDayName = (dayOfWeek: number) => {
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return days[dayOfWeek];
  };

  const formatTime = (time: string | null | undefined) => {
    if (!time) return "N/A";
    return time.substring(0, 5); // Convert HH:MM:SS to HH:MM
  };

  const groupSchedulesByTime = () => {
    if (!schedules || schedules.length === 0) return [];

    // Filtrar solo horarios abiertos y con horarios válidos
    const openSchedules = schedules.filter((schedule) => schedule.is_open && schedule.open_time && schedule.close_time);

    // Ordenar por día de la semana y luego por hora de apertura
    const sortedSchedules = openSchedules.sort((a, b) => {
      const dayA = a.day_of_week;
      const dayB = b.day_of_week;
      if (dayA !== dayB) return dayA - dayB;
      // Si es el mismo día, ordenar por hora de apertura
      return (a.open_time || "").localeCompare(b.open_time || "");
    });

    // Agrupar horarios por día
    const dayGroups: { [key: number]: string[] } = {};
    sortedSchedules.forEach((schedule) => {
      const day = schedule.day_of_week;
      const timeRange = `${formatTime(schedule.open_time)} - ${formatTime(schedule.close_time)}`;

      if (!dayGroups[day]) {
        dayGroups[day] = [];
      }
      dayGroups[day].push(timeRange);
    });

    // Crear la clave única para cada combinación de días y horarios
    const scheduleGroups: { [key: string]: number[] } = {};

    Object.entries(dayGroups).forEach(([day, timeRanges]) => {
      const scheduleKey = timeRanges.join(" y ");
      const dayNum = parseInt(day);

      if (!scheduleGroups[scheduleKey]) {
        scheduleGroups[scheduleKey] = [];
      }
      scheduleGroups[scheduleKey].push(dayNum);
    });

    return Object.entries(scheduleGroups)
      .map(([schedule, days]) => {
        const dayNames = days.map((day) => getDayName(day));
        let dayRange = "";

        if (days.length === 1) {
          dayRange = dayNames[0];
        } else {
          // Ordenar días para detectar secuencias
          const sortedDays = days.sort((a, b) => {
            const dayA = a === 0 ? 7 : a;
            const dayB = b === 0 ? 7 : b;
            return dayA - dayB;
          });

          // Agrupar días consecutivos
          const consecutiveGroups = [];
          let currentGroup = [sortedDays[0]];

          for (let i = 1; i < sortedDays.length; i++) {
            const prevDay = sortedDays[i - 1] === 0 ? 7 : sortedDays[i - 1];
            const currentDay = sortedDays[i] === 0 ? 7 : sortedDays[i];

            if (currentDay === prevDay + 1) {
              currentGroup.push(sortedDays[i]);
            } else {
              consecutiveGroups.push(currentGroup);
              currentGroup = [sortedDays[i]];
            }
          }
          consecutiveGroups.push(currentGroup);

          dayRange = consecutiveGroups
            .map((group) => {
              if (group.length === 1) {
                return getDayName(group[0]);
              } else if (group.length === 2) {
                return `${getDayName(group[0])} y ${getDayName(group[1])}`;
              } else {
                return `${getDayName(group[0])} a ${getDayName(group[group.length - 1])}`;
              }
            })
            .join(", ");
        }

        return { dayRange, timeRange: schedule, sortOrder: Math.min(...days.map((d) => (d === 0 ? 7 : d))) };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const features = [
    {
      icon: <Star className="w-6 h-6 text-restaurant-gold" />,
      title: "El arte de la brasa",
      description: "Platos únicos creados por nuestro chef con ingredientes frescos y de primera calidad",
    },
    {
      icon: <MapPin className="w-6 h-6 text-restaurant-gold" />,
      title: "Ubicación Privilegiada",
      description: "En el corazón de la ciudad, con un ambiente cálido y acogedor",
    },
    {
      icon: <Clock className="w-6 h-6 text-restaurant-gold" />,
      title: "Horarios Flexibles",
      description: "Abierto todos los días, con horarios de comida y cena adaptados a ti",
    },
  ];
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl font-bold text-restaurant-brown mb-4">Sobre Nuestro Restaurante</h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Desde 2019 creando experiencias gastronómicas únicas, combinando tradición culinaria con innovación moderna
            en cada plato que servimos.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="text-center shadow-elegant hover:shadow-glow transition-all duration-300 animate-slide-up"
            >
              <CardHeader>
                <div className="flex justify-center mb-4">{feature.icon}</div>
                <CardTitle className="text-restaurant-brown">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contact Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="shadow-elegant animate-slide-up">
            <CardHeader>
              <CardTitle className="text-restaurant-brown flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Ubicación y contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1.5">
                <p className="font-semibold">Dirección:</p>
                {config?.contact_address ? (
                  <p className="text-muted-foreground">{config.contact_address}</p>
                ) : (
                  <p className="text-muted-foreground">Dirección no disponible</p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Contacto:
                </p>
                {config?.contact_phone && <p className="text-sm text-muted-foreground">{config.contact_phone}</p>}
                {config?.contact_email && <p className="text-sm text-muted-foreground">{config.contact_email}</p>}
                {!config?.contact_phone && !config?.contact_email && (
                  <p className="text-sm text-muted-foreground">Información de contacto no disponible</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-elegant animate-slide-up">
            <CardHeader>
              <CardTitle className="text-restaurant-brown flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Horarios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1.5">
                <p>
                  <span className="font-semibold">Lunes:</span>{" "}
                  <span className="text-sm text-muted-foreground">De 13:30 a 17:00</span>
                </p>
                <p>
                  <span className="font-semibold">Martes:</span>{" "}
                  <span className="text-sm text-muted-foreground">De 13:30 a 17:00</span>
                </p>
                <p>
                  <span className="font-semibold">Miércoles:</span>{" "}
                  <span className="text-sm text-muted-foreground">De 13:30 a 17:00</span>
                </p>
                <p>
                  <span className="font-semibold">Jueves:</span>{" "}
                  <span className="text-sm text-muted-foreground">De 13:30 a 17:00 y de 20:30 a 24:00</span>
                </p>
                <p>
                  <span className="font-semibold">Viernes:</span>{" "}
                  <span className="text-sm text-muted-foreground">De 13:30 a 17:00 y de 20:30 a 24:00</span>
                </p>
                <p>
                  <span className="font-semibold">Sábado:</span>{" "}
                  <span className="text-sm text-muted-foreground">De 13:30 a 17:00 y de 20:30 a 24:00</span>
                </p>
                <p>
                  <span className="font-semibold">Domingo:</span>{" "}
                  <span className="text-sm text-muted-foreground">De 13:30 a 17:00</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};
export default RestaurantInfo;
