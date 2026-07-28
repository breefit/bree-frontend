import { Navigate, useParams } from "react-router-dom";

export default function OrderRedirect() {
  const { id } = useParams();

  return <Navigate to={`/order/${id}/tracking`} replace />;
}
