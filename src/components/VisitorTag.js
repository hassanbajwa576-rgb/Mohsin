import { OM_TAGS, OM_TAG_LABEL } from '@/lib/visitors';
import { tagVisitor } from '@/lib/vis-actions';

// The tag and remark the Sr. Ops Manager put on a visitor record, shown to everyone who sees the visitor.
export function TagNote({ v }) {
  if (!v.om_tag && !v.om_note) return null;
  return (
    <div className='vtag'>
      {v.om_tag ? <span className={'badge vtag-' + v.om_tag}>{OM_TAG_LABEL[v.om_tag]}</span> : null}
      {v.om_note ? <span className='vtag-note'>{v.om_note}</span> : null}
    </div>
  );
}

// Sr. Ops Manager only: set or change the tag and remark.
export function TagForm({ v, to }) {
  return (
    <details className='vtag-edit'>
      <summary className='btn ghost'>{v.om_tag || v.om_note ? 'Edit tag' : 'Tag'}</summary>
      <form action={tagVisitor} className='vtag-form'>
        <input type='hidden' name='id' value={v.id} />
        <input type='hidden' name='to' value={to} />
        <select name='tag' defaultValue={v.om_tag || ''} aria-label='Tag'>
          <option value=''>No tag</option>
          {OM_TAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input name='note' defaultValue={v.om_note || ''} maxLength={200} placeholder='Remark for the guard (optional)' autoComplete='off' />
        <button className='btn primary' type='submit'>Save</button>
      </form>
    </details>
  );
}
