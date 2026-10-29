import LoginPage from "@/components/login-page";

export default function Page() {
  return <LoginPage localPreviewAvailable={process.env.NODE_ENV !== "production"} />;
}
