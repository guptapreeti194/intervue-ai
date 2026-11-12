import Button from './Button'
import DemoBadge from './DemoBadge'

type PlaceholderPageProps = {
  eyebrow: string
  title: string
  description: string
  badge?: boolean
}

export default function PlaceholderPage({
  eyebrow,
  title,
  description,
  badge = true,
}: PlaceholderPageProps) {
  return (
    <section className="placeholder">
      <div className="container">
        <div className="card placeholder-card" style={{ margin: '0 auto' }}>
          {badge && <DemoBadge label="Coming in the next stage" />}
          <div>
            <span className="eyebrow">{eyebrow}</span>
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className="placeholder-actions">
            <Button to="/">Back to home</Button>
            <Button to="/practice" variant="ghost">
              Go to practice
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}