import type { ReactNode } from 'react'

export const EmptyState = ({
  title,
  description,
  action
}: {
  title: string
  description: string
  action?: ReactNode
}) => (
  <div className="empty-state">
    <div className="empty-state__mark" />
    <h3>{title}</h3>
    <p>{description}</p>
    {action}
  </div>
)