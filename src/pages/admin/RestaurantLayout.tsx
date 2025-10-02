import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, MapPin, Layout } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ZonesManager from "./ZonesManager";

interface TableData {
  id: string;
  name: string;
  capacity: number;
  min_capacity: number;
  max_capacity: number;
  extra_capacity: number;
  shape: "square" | "round";
  position_x: number;
  position_y: number;
  is_active: boolean;
}

const RestaurantLayout = () => {
  const [tables, setTables] = useState<TableData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedTable, setDraggedTable] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const GRID_SIZE = 30; // Size of each grid cell in pixels (reduced from 60 for more flexibility)

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      const { data, error } = await supabase.from("tables").select("*").order("name");

      if (error) throw error;
      setTables((data as TableData[]) || []);
    } catch (error) {
      console.error("Error loading tables:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las mesas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, tableId: string) => {
    setDraggedTable(tableId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const snapToGrid = (value: number) => {
    const containerSize = 1200; // Usar el ancho fijo del contenedor
    const pixelValue = (value / 100) * containerSize;
    const gridSnappedValue = Math.round(pixelValue / GRID_SIZE) * GRID_SIZE;

    return (Math.max(0, Math.min(containerSize, gridSnappedValue)) / containerSize) * 100;
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTable) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;

    // Snap to grid
    const x = snapToGrid(rawX);
    const y = snapToGrid(rawY);

    try {
      const updateData: Partial<TableData> = {
        position_x: Math.max(0, Math.min(95, x)),
        position_y: Math.max(0, Math.min(95, y)),
      };

      const { error } = await supabase.from("tables").update(updateData).eq("id", draggedTable);

      if (error) throw error;

      await loadTables();
      toast({
        title: "Mesa reposicionada",
        description: "La posición de la mesa se ha actualizado",
      });
    } catch (error) {
      console.error("Error updating table position:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la posición",
        variant: "destructive",
      });
    }

    setDraggedTable(null);
  };

  const renderTable = (table: TableData) => {
    const isSquare = table.shape === "square";
    const isActive = table.is_active;

    return (
      <div
        key={table.id}
        draggable={isActive} // Solo se pueden arrastrar las activas
        onDragStart={(e) => isActive && handleDragStart(e, table.id)}
        className={`absolute transition-all duration-200 ${
          isActive ? "cursor-move hover:scale-105" : "cursor-not-allowed opacity-50"
        } ${isSquare ? "rounded-lg" : "rounded-full"} ${
          isActive
            ? "bg-restaurant-cream border-2 border-restaurant-gold shadow-lg"
            : "bg-gray-200 border-2 border-gray-400 shadow-md"
        } flex items-center justify-center font-medium ${
          isActive ? "text-restaurant-brown" : "text-gray-500"
        } select-none`}
        style={{
          left: `${table.position_x}%`,
          top: `${table.position_y}%`,
          width: "60px",
          height: "60px",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="text-center">
          <div className="text-xs font-bold">{table.name}</div>
          <div className="text-xs">
            {table.min_capacity}-{table.max_capacity}
            {table.extra_capacity > 0 && `(+${table.extra_capacity})`}
          </div>
          {!isActive && <div className="text-[10px] font-semibold text-red-600">INACTIVA</div>}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Cargando distribución...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-restaurant-brown">Distribución del Restaurante</h1>
          <p className="text-muted-foreground">Gestiona el layout y las zonas del restaurante</p>
        </div>
        <Button onClick={() => navigate("/admin/tables")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a Mesas
        </Button>
      </div>


      <Tabs defaultValue="layout" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="layout" className="flex items-center gap-2">
            <Layout className="w-4 h-4" />
            Distribución en Planta
          </TabsTrigger>
          <TabsTrigger value="zones" className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Gestión de Zonas
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: LAYOUT */}
        <TabsContent value="layout" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <Button onClick={loadTables} variant="outline">
              Actualizar Layout
            </Button>

          </div>

          <Card>
            <CardHeader>
              <CardTitle>Layout del Restaurante</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full h-96 overflow-auto">
                <div
                  className="relative bg-gradient-to-br from-restaurant-cream/30 to-restaurant-gold/10 border-2 border-dashed border-restaurant-gold/30 rounded-lg"
                  style={{
                    width: "100rem",
                    height: "40rem",
                    backgroundImage: `radial-gradient(circle at center, rgba(0,0,0,0.1) 1px, transparent 1px)`,
                    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                    transform: "scale(0.75)",
                    transformOrigin: "top left",
                  }}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  {tables.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      No hay mesas configuradas. Ve a la gestión de mesas para crear algunas.
                    </div>
                  ) : (
                    tables.map(renderTable)
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leyenda</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-restaurant-cream border border-restaurant-gold rounded"></div>
                    <span className="text-sm">Mesa cuadrada</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-restaurant-cream border border-restaurant-gold rounded-full"></div>
                    <span className="text-sm">Mesa redonda</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Instrucciones</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Arrastra las mesas para moverlas</li>
                  <li>• El número muestra capacidad mín-máx</li>
                  <li>• (+n) indica capacidad extra</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Estadísticas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p>Total mesas: {tables.length}</p>
                  <p>Capacidad total: {tables.reduce((sum, t) => sum + t.max_capacity, 0)} personas</p>
                  <p>
                    Con capacidad extra: {tables.reduce((sum, t) => sum + t.max_capacity + t.extra_capacity, 0)}{" "}
                    personas
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: ZONAS */}
        <TabsContent value="zones" className="mt-6">
          <ZonesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RestaurantLayout;
