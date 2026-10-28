import Logo from '@/components/Logo';

// The branded opening shows immediately, before the server has finished preparing the page.
export default function Loading() {
  return (
    <div className='welcome splash' role='status' aria-label='Loading OpsTrack'>
      <div className='welcome-in'>
        <Logo height={72} />
        <div className='welcome-brand'>Ops<span>Track</span></div>
        <div className='splash-bar'><i /></div>
      </div>
      <div className='welcome-foot'>Powered by <b>Ops</b> | AlphaBOLD</div>
    </div>
  );
}
