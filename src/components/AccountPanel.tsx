import { requireUser } from "@/lib/session";
import { signOutAction } from "@/app/actions";
import { Icon } from "./ui/Icon";

// The signed-in account and the sign-out action, at the foot of the sidebar. Reads the session,
// so it renders inside a Suspense boundary; with no session it redirects to /signin.
export async function AccountPanel() {
  const user = await requireUser();
  return (
    <div className="app-account">
      <div className="app-account-who">
        {user.name ? <span className="app-account-name">{user.name}</span> : null}
        <span className="small app-account-email" title={user.email}>
          {user.email}
        </span>
      </div>
      <form action={signOutAction}>
        <button type="submit" className="bfm-nav-item app-account-signout">
          <Icon name="signOut" />
          Sign out
        </button>
      </form>
    </div>
  );
}
