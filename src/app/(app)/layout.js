import Nav from '@/components/Nav';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await requireUser();
  return (
    <>
      <Nav user={user} />
      <main className='wrap'>{children}</main>
    </>
  );
}
