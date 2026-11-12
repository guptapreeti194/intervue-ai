type DemoBadgeProps = {
  label?: string
}

export default function DemoBadge({ label = 'Demo data' }: DemoBadgeProps) {
  return (
    <span className="demo-badge" title="Simulated result. No real AI analysis was performed.">
      {label}
    </span>
  )
}