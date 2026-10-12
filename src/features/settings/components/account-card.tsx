import { FormEvent, useState } from "react";
import { LogOut, Save, UserRound } from "lucide-react";
import type { RemoteAccount } from "@/features/monitoring/repositories";

const ROLE_LABELS: Record<RemoteAccount["schools"][number]["role"], string> = {
  admin: "Administración",
  coordinator: "Coordinación",
  teacher: "Docente",
};

type AccountCardProps = {
  account: RemoteAccount;
  busy: boolean;
  onUpdateName: (fullName: string) => Promise<boolean>;
  onSignOut: () => void;
};

export function AccountCard({ account, busy, onUpdateName, onSignOut }: AccountCardProps) {
  const [name, setName] = useState(account.fullName);
  const changed = name.trim() !== "" && name.trim() !== account.fullName;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changed) await onUpdateName(name.trim());
  }

  return (
    <article className="card settings-card">
      <div className="card-heading">
        <div><p className="eyebrow">Cuenta</p><h2>{account.fullName}</h2></div>
        <UserRound size={20} />
      </div>
      <ul className="settings-list">
        <li>{account.email}</li>
        {account.schools.map((school) => (
          <li key={school.id}>{school.name} · {ROLE_LABELS[school.role]}</li>
        ))}
        <li>Tus clases y registros quedan a nombre de esta cuenta.</li>
      </ul>
      <form className="form-stack account-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Nombre que aparece en informes</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
        </label>
        <div className="backup-actions">
          <button className="secondary-button" disabled={!changed || busy}>
            <Save size={17} /> Guardar nombre
          </button>
          <button type="button" className="secondary-button" onClick={onSignOut}>
            <LogOut size={17} /> Cerrar sesión
          </button>
        </div>
      </form>
    </article>
  );
}
