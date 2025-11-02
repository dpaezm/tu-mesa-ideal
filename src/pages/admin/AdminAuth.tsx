import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, AlertCircle, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Definir el tipo para el perfil de usuario
interface UserProfile {
  role: "admin" | "user";
  is_active: boolean;
}

const AdminAuth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showEmergencyAccess, setShowEmergencyAccess] = useState(false);
  const { loginLocalAdmin } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Usar fetch directo al endpoint de GoTrue debido a problemas con supabase.auth
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const loginPromise = fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }).then(async (response) => {
        const data = await response.json();
        
        if (!response.ok) {
          return { data: null, error: { message: data.error_description || data.msg || "Credenciales incorrectas" } };
        }
        
        // Si las credenciales son válidas, usar admin local
        // Evitamos setSession() que también tiene problemas de timeout
        return { data: { user: data.user }, error: null };
      });

      // Timeout de 10 segundos
      const timeoutPromise = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 10000)
      );

      const { data, error } = await Promise.race([
        loginPromise,
        timeoutPromise
      ]).catch(() => ({ data: null, error: { message: "Timeout de conexión" } })) as any;

      // Fallback para admin conocido si hay error
      if (error && email === "admin@admin.es" && password === "password") {
        loginLocalAdmin();
        toast({
          title: "Acceso de emergencia",
          description: "Conectado como administrador local",
        });
        setTimeout(() => window.location.href = "/admin", 800);
        return;
      }

      if (error) {
        toast({
          title: "Error de autenticación",
          description: error.message || "Credenciales incorrectas",
          variant: "destructive",
        });
        return;
      }

      if (data?.user) {
        // Usar admin local en lugar de sesión de Supabase
        loginLocalAdmin();
        toast({
          title: "Acceso autorizado",
          description: "Redirigiendo al panel...",
        });
        setTimeout(() => window.location.href = "/admin", 800);
      }
    } catch (error) {
      console.error("Error en login:", error);
      
      // Fallback final para admin conocido
      if (email === "admin@admin.es" && password === "password") {
        loginLocalAdmin();
        toast({
          title: "Acceso de emergencia",
          description: "Conectado como administrador local",
        });
        setTimeout(() => window.location.href = "/admin", 800);
        return;
      }
      
      toast({
        title: "Error",
        description: "Ha ocurrido un error durante el inicio de sesión",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyLogin = () => {
    loginLocalAdmin();
    toast({
      title: "Acceso de emergencia",
      description: "Has iniciado sesión como administrador local",
    });
    setTimeout(() => window.location.href = "/admin", 500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-restaurant-cream to-restaurant-gold/20 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-restaurant-gold/20 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-restaurant-brown" />
          </div>
          <CardTitle className="text-2xl font-bold text-restaurant-brown">Panel de Administración</CardTitle>
          <CardDescription>Ingresa tus credenciales para acceder al sistema</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/*           <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Credenciales por defecto:</strong>
              <br />
              Email: admin@admin.es
              <br />
              Contraseña: password
            </AlertDescription>
          </Alert> */}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Introduce tu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-restaurant-brown hover:bg-restaurant-brown/90"
              disabled={isLoading}
            >
              {isLoading ? "Iniciando Sesión..." : "Iniciar Sesión"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            {/*  <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">O</span>
            </div> */}
          </div>

          {/*           <Button variant="outline" className="w-full" onClick={handleEmergencyLogin} disabled={isLoading}>
            <Shield className="w-4 h-4 mr-2" />
            Acceso de Emergencia
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            <p>Si no tienes usuarios en la base de datos,</p>
            <p>usa el "Acceso de Emergencia" para comenzar.</p>
          </div> */}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuth;
