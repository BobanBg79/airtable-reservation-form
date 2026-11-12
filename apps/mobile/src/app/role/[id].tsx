import { useLocalSearchParams } from 'expo-router';
import { NoAccess } from '../../components/NoAccess';
import { RoleFormScreen } from '../../components/RoleFormScreen';
import { useAuth } from '../../state/AuthProvider';

// The permissions of one role, read-only, with Edit for a user who has can_edit_role. Reached from the Roles list.
export default function RoleScreen() {
  const { canOpen } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  return canOpen('roles') && id ? <RoleFormScreen id={String(id)} /> : <NoAccess what="the role details" />;
}
