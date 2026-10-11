export default function Flash({ sp }) {
  if (sp?.err) return <div className='flash bad'>{sp.err}</div>;
  if (sp?.ok) return <div className='flash ok'>{sp.ok}</div>;
  return null;
}
