// Shown the moment a link is tapped, while the next page is being prepared, so changing pages feels instant.
export default function PageLoading() {
  return (
    <div className='skel' role='status' aria-label='Loading'>
      <div className='skel-bar skel-title' />
      <div className='skel-bar skel-sub' />
      <div className='skel-row'>
        <div className='skel-bar skel-card' />
        <div className='skel-bar skel-card' />
      </div>
      <div className='skel-bar skel-block' />
    </div>
  );
}
