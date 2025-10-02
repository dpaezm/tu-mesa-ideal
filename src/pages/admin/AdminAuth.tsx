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
  const { loginLocalAdmin } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // console.log("Attempting login with:", email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Supabase auth error:", error);

        // Fallback para credenciales admin conocidas
        if (email === "admin@admin.es" && password === "password") {
          // console.log("Using local admin fallback for known credentials");
          loginLocalAdmin();
          toast({
            title: "Acceso de emergencia activado",
            description: "Conectado como administrador local",
          });
          setTimeout(() => {
            window.location.href = "/admin";
          }, 500);
          return;
        }

        toast({
          title: "Error de autenticación",
          description: error.message || "Credenciales incorrectas",
          variant: "destructive",
        });
        return;
      }

      if (data.user) {
        // console.log("Successfully logged in with user:", data.user.id);

        // Verificar que el usuario tenga perfil de admin
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, is_active")
          .eq("id", data.user.id)
          .single();

        if (profileError) {
          console.error("Error fetching user profile:", profileError);
          await supabase.auth.signOut();
          toast({
            title: "Error de autorización",
            description: "No se pudo verificar los permisos del usuario",
            variant: "destructive",
          });
          return;
        }

        // Verificar que el perfil existe y tiene las propiedades necesarias
        const userProfile = profile as UserProfile;
        if (!userProfile || !userProfile.is_active || (userProfile.role !== "admin" && userProfile.role !== "user")) {
          console.error("User is inactive or has invalid role:", userProfile);
          await supabase.auth.signOut();
          toast({
            title: "Acceso denegado",
            description: "Tu cuenta está inactiva o no tienes permisos válidos",
            variant: "destructive",
          });
          return;
        }

        const roleText = userProfile.role === "admin" ? "administración" : "gestión";
        toast({
          title: "Acceso autorizado",
          description: `Bienvenido al panel de ${roleText}`,
        });

        // Redirigir después de verificar permisos
        setTimeout(() => {
          window.location.href = "/admin";
        }, 500);
      }
    } catch (error) {
      console.error("Login error:", error);

      // Fallback final para admin conocido
      if (email === "admin@admin.es" && password === "password") {
        // console.log("Exception caught, using local admin fallback");
        loginLocalAdmin();
        toast({
          title: "Acceso de emergencia activado",
          description: "Error de conexión, usando administrador local",
        });
        setTimeout(() => {
          window.location.href = "/admin";
        }, 500);
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
    // console.log("Emergency login clicked");
    loginLocalAdmin();
    toast({
      title: "Acceso de emergencia activado",
      description: "Has iniciado sesión como administrador local",
    });

    // Dar tiempo para que se establezca el estado antes de redirigir
    setTimeout(() => {
      // console.log("Redirecting to /admin");
      window.location.href = "/admin";
    }, 500);
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
