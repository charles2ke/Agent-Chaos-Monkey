import { useId } from 'react'

interface InfoTipProps {
  /** Descriptive sentence shown on hover and keyboard focus. */
  text: string
  /** What the tip explains, used to build the accessible name of the trigger. */
  label: string
}

/**
 * A small "i" trigger that reveals a descriptive tooltip on hover or keyboard focus.
 * The bubble is hidden from the accessibility tree until it is shown, so page text
 * queries and accessible names stay stable.
 */
export function InfoTip({ text, label }: InfoTipProps) {
  const id = useId()
  return (
    <span className="tip">
      <button
        type="button"
        className="tip__trigger"
        aria-label={`About ${label}: ${text}`}
        aria-describedby={id}
        title={text}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span className="tip__bubble" id={id} role="tooltip">
        {text}
      </span>
    </span>
  )
}

interface TipHeadingProps {
  title: string
  text: string
  level?: 3 | 4
  id?: string
}

/** A section heading with an adjacent tooltip; the tip sits outside the heading element. */
export function TipHeading({ title, text, level = 3, id }: TipHeadingProps) {
  const Heading = level === 3 ? 'h3' : 'h4'
  return (
    <div className="tipHeading">
      <Heading className="page__subtitle" id={id}>
        {title}
      </Heading>
      <InfoTip text={text} label={title} />
    </div>
  )
}
