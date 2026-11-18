import LoginPage from '../../components/login-page';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <LoginPage emailEnabled={process.env.AZURE_AUTH_MODE === 'email'} microsoftEnabled={process.env.AZURE_AUTH_MODE === 'app-service'} />;
}
