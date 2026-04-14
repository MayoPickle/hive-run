import { useCallback, useEffect, useState } from 'react';
import { createUser, getUsers, resetUserPassword, updateUser } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { CreateUserRequest, UserRole, UserSummary } from '../lib/types';
import { useToast } from '../components/Toast';

type EditDraft = {
  display_name: string;
  role: UserRole;
  can_use_proxy: boolean;
  is_active: boolean;
};

const ROLE_OPTIONS: UserRole[] = ['viewer', 'operator', 'admin'];

export default function UsersPage() {
  const toast = useToast();
  const { user: currentUser, refresh } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});
  const [createForm, setCreateForm] = useState<CreateUserRequest>({
    username: '',
    display_name: '',
    password: '',
    role: 'viewer',
    can_use_proxy: false,
    is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await getUsers());
    } catch (error: any) {
      toast(error.message || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const beginEdit = (user: UserSummary) => {
    setEditingId(user.id);
    setDrafts((current) => ({
      ...current,
      [user.id]: {
        display_name: user.display_name,
        role: user.role,
        can_use_proxy: user.can_use_proxy,
        is_active: user.is_active,
      },
    }));
  };

  const updateDraft = (userId: string, next: Partial<EditDraft>) => {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...next,
      },
    }));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createUser(createForm);
      toast('User created');
      setCreateForm({
        username: '',
        display_name: '',
        password: '',
        role: 'viewer',
        can_use_proxy: false,
        is_active: true,
      });
      setShowCreate(false);
      await load();
    } catch (error: any) {
      toast(error.message || 'Failed to create user', 'error');
    }
  };

  const handleSave = async (userId: string) => {
    const draft = drafts[userId];
    if (!draft) {
      return;
    }

    try {
      const updatedUser = await updateUser(userId, draft);
      toast('User updated');
      setEditingId(null);
      setDrafts((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      if (updatedUser.id === currentUser?.id) {
        await refresh();
        return;
      }
      await load();
    } catch (error: any) {
      toast(error.message || 'Failed to update user', 'error');
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!resetPassword.trim()) {
      toast('Enter a new password first', 'error');
      return;
    }

    try {
      const updatedUser = await resetUserPassword(userId, { new_password: resetPassword });
      toast('Password reset');
      setResettingId(null);
      setResetPassword('');
      if (updatedUser.id === currentUser?.id) {
        await refresh();
        return;
      }
      await load();
    } catch (error: any) {
      toast(error.message || 'Failed to reset password', 'error');
    }
  };

  const inputCls = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-ring focus-visible:outline-none focus-visible:ring-1';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Users</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage local accounts, roles, activity state, and proxy access.</p>
        </div>
        <button
          onClick={() => setShowCreate((current) => !current)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New User
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="animate-in rounded-lg border border-border bg-card p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Create user</h3>
              <p className="mt-1 text-xs text-muted-foreground">Usernames are login identifiers. Roles and proxy access can be adjusted later.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
              <input
                type="text"
                value={createForm.username}
                onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display name</label>
              <input
                type="text"
                value={createForm.display_name}
                onChange={(event) => setCreateForm((current) => ({ ...current, display_name: event.target.value }))}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Initial password</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Role</label>
              <select
                value={createForm.role}
                onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value as UserRole }))}
                className={inputCls}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2.5">
              <input
                type="checkbox"
                checked={createForm.can_use_proxy}
                onChange={(event) => setCreateForm((current) => ({ ...current, can_use_proxy: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span className="text-sm text-muted-foreground">Allow proxy usage</span>
            </label>
            <label className="flex items-end gap-2.5">
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(event) => setCreateForm((current) => ({ ...current, is_active: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span className="text-sm text-muted-foreground">Active on create</span>
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading users...</div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const isEditing = editingId === user.id;
            const draft = drafts[user.id];
            const isResetting = resettingId === user.id;
            const currentRoleCls = user.role === 'admin'
              ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
              : user.role === 'operator'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                : 'border-border bg-accent/40 text-muted-foreground';

            return (
              <div key={user.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium">{user.display_name}</h3>
                      {user.id === currentUser?.id && (
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">You</span>
                      )}
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] ${currentRoleCls}`}>{user.role}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] ${user.is_active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                        {user.is_active ? 'active' : 'disabled'}
                      </span>
                      {user.can_use_proxy && (
                        <span className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-300">proxy</span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{user.username}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                      <span>Created {new Date(user.created_at).toLocaleString()}</span>
                      <span>Updated {new Date(user.updated_at).toLocaleString()}</span>
                      <span>{user.last_login_at ? `Last login ${new Date(user.last_login_at).toLocaleString()}` : 'No sign-ins yet'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => beginEdit(user)}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setResettingId((current) => current === user.id ? null : user.id);
                        setResetPassword('');
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      Reset Password
                    </button>
                  </div>
                </div>

                {isEditing && draft && (
                  <div className="mt-5 grid gap-4 rounded-lg border border-border/80 bg-background/40 p-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display name</label>
                      <input
                        type="text"
                        value={draft.display_name}
                        onChange={(event) => updateDraft(user.id, { display_name: event.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Role</label>
                      <select
                        value={draft.role}
                        onChange={(event) => updateDraft(user.id, { role: event.target.value as UserRole })}
                        className={inputCls}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-end gap-2.5">
                      <input
                        type="checkbox"
                        checked={draft.can_use_proxy}
                        onChange={(event) => updateDraft(user.id, { can_use_proxy: event.target.checked })}
                        className="mt-0.5 h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm text-muted-foreground">Allow proxy usage</span>
                    </label>
                    <label className="flex items-end gap-2.5">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(event) => updateDraft(user.id, { is_active: event.target.checked })}
                        className="mt-0.5 h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm text-muted-foreground">Account active</span>
                    </label>
                    <div className="md:col-span-2 xl:col-span-4 flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(user.id)}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                      >
                        Save changes
                      </button>
                    </div>
                  </div>
                )}

                {isResetting && (
                  <div className="mt-5 flex flex-col gap-3 rounded-lg border border-border/80 bg-background/40 p-4 md:flex-row md:items-end">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">New password</label>
                      <input
                        type="password"
                        value={resetPassword}
                        onChange={(event) => setResetPassword(event.target.value)}
                        className={inputCls}
                        placeholder="At least 8 characters"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setResettingId(null);
                          setResetPassword('');
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleResetPassword(user.id)}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                      >
                        Apply password
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
