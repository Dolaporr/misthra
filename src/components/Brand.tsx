export function MisthraMark({className=''}:{className?:string}) {
  return <svg className={`misthra-mark ${className}`} viewBox="0 0 40 36" fill="none" aria-hidden="true">
    <path pathLength="1" d="M3 30V9c0-4.5 4.7-6 7.2-2.2L20 22" />
    <path pathLength="1" d="M37 30V9c0-4.5-4.7-6-7.2-2.2L20 22" />
  </svg>;
}

export function Brand() {
  return <><MisthraMark/><span className="brand-name">misthra</span></>;
}
