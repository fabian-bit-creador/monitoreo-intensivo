import { LogOut, ShieldAlert } from "lucide-react";

type NoAccessScreenProps = {
  email: string;
  onSignOut: () => void;
};

/** Cuenta válida pero sin membresía: no ve datos de ningún establecimiento. */
export function NoAccessScreen({ email, onSignOut }: NoAccessScreenProps) {
  return (
    <div className="loading-screen error-screen">
      <ShieldAlert size={30} />
      <h1>Tu cuenta todavía no tiene acceso</h1>
      <p className="recovery-text">
        Ingresaste como {email}, pero esta cuenta no pertenece a ningún establecimiento. Pide a
        administración que te invite con este correo y vuelve a ingresar.
      </p>
      <div className="recovery-actions">
        <button className="secondary-button" onClick={onSignOut}>
          <LogOut size={17} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
