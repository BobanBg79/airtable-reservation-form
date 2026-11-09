import { NoAccess } from '../../components/NoAccess';
import { UserFormScreen } from '../../components/UserFormScreen';
import { useAuth } from '../../state/AuthProvider';

// Add user. Needs can_create_user (admin only by default); the server checks it again.
export default function NewUserScreen() {
  const { can } = useAuth();
  return can('can_create_user') ? <UserFormScreen /> : <NoAccess what="the form for adding a user" />;
}
