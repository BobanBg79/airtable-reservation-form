import { useLocalSearchParams } from 'expo-router';
import { NoAccess } from '../../components/NoAccess';
import { UserFormScreen } from '../../components/UserFormScreen';
import { useAuth } from '../../state/AuthProvider';

// User details, read-only, with Edit for a user who has can_edit_user. Reached from the Users list.
export default function UserDetailsScreen() {
  const { canOpen } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  return canOpen('users') && id ? <UserFormScreen id={String(id)} /> : <NoAccess what="user details" />;
}
