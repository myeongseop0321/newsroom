import Desk from './desk';
import { getAppUser, signInPath, signOutPath } from './auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
 const user = await getAppUser();
 return <Desk user={user ? { name: user.displayName, email: user.email } : null} signInUrl={signInPath('/')} signOutUrl={signOutPath('/')} />;
}
