import { Compass } from "lucide-react";
import { Link } from "react-router";
import { EmptyState, Panel } from "../components/ui";

export default function NotFound() {
  return (
    <Panel>
      <EmptyState icon={<Compass size={30} aria-hidden="true" />} title="Página no encontrada" hint="La ruta solicitada no existe en CampusPulse 360." />
      <div className="pb-6 text-center">
        <Link to="/" className="btn btn-primary no-underline">
          Volver al Centro de mando
        </Link>
      </div>
    </Panel>
  );
}
