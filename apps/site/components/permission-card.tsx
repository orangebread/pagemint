type PermissionCardProps = {
  permission: string;
  title: string;
  body: string;
};

export function PermissionCard({ permission, title, body }: PermissionCardProps) {
  return (
    <article className="panel nestedPanel permissionCard">
      <p className="permissionLabel">{permission}</p>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
