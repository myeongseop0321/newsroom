import Desk from './desk';
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
 const user = await getChatGPTUser();
 return <Desk user={user ? { name: user.displayName, email: user.email } : null} signInUrl={chatGPTSignInPath('/')} signOutUrl={chatGPTSignOutPath('/')} />;
}
