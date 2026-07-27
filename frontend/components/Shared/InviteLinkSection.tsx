import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ClipboardDocumentIcon,
    CheckIcon,
    LinkIcon,
} from '@heroicons/react/24/outline';
import {
    createInvitation,
    Invitation,
    InviteAccessLevel,
    InviteResourceType,
    listInvitations,
    revokeInvitation,
} from '../../utils/invitationsService';

interface InviteLinkSectionProps {
    resourceType: InviteResourceType;
    resourceUid: string;
}

/**
 * Owner-facing "invite by link" block for share dialogs: create an invite
 * link, copy it, and see/revoke active invitations for the resource.
 */
const InviteLinkSection: React.FC<InviteLinkSectionProps> = ({
    resourceType,
    resourceUid,
}) => {
    const { t } = useTranslation();
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [access, setAccess] = useState<InviteAccessLevel>('ro');
    const [creating, setCreating] = useState(false);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = () =>
        listInvitations(resourceType, resourceUid)
            .then(setInvitations)
            .catch(() => setInvitations([]));

    useEffect(() => {
        refresh();
    }, [resourceType, resourceUid]);

    const inviteUrl = (token: string) =>
        `${window.location.origin}/invite/${token}`;

    const copy = async (token: string) => {
        try {
            await navigator.clipboard.writeText(inviteUrl(token));
            setCopiedToken(token);
            setTimeout(() => setCopiedToken(null), 2000);
        } catch {
            // Clipboard may be unavailable; the URL is visible in the list
        }
    };

    const onCreate = async () => {
        setCreating(true);
        setError(null);
        try {
            const created = await createInvitation({
                resource_type: resourceType,
                resource_uid: resourceUid,
                access_level: access,
            });
            await refresh();
            await copy(created.token);
        } catch (err: any) {
            setError(err.message || 'Failed to create invitation');
        } finally {
            setCreating(false);
        }
    };

    const onRevoke = async (token: string) => {
        try {
            await revokeInvitation(token);
            await refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to revoke invitation');
        }
    };

    const activeInvitations = invitations.filter((i) => i.active);

    return (
        <div className="px-6 pb-5">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('invites.sectionTitle', 'Invite by link')}
            </div>
            <div className="flex items-center gap-2 mb-2">
                <select
                    value={access}
                    onChange={(e) =>
                        setAccess(e.target.value as InviteAccessLevel)
                    }
                    className="rounded border px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                >
                    <option value="ro">
                        {t('shares.readOnly', 'Read only')}
                    </option>
                    <option value="rw">
                        {t('shares.readWrite', 'Read & write')}
                    </option>
                </select>
                <button
                    type="button"
                    onClick={onCreate}
                    disabled={creating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-60"
                >
                    <LinkIcon className="h-4 w-4" />
                    {creating
                        ? t('common.saving', 'Saving...')
                        : t('invites.createLink', 'Create invite link')}
                </button>
            </div>
            {error && <div className="text-sm text-red-500 mb-2">{error}</div>}
            {activeInvitations.length > 0 && (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-md">
                    {activeInvitations.map((inv) => (
                        <li
                            key={inv.token}
                            className="flex items-center justify-between px-3 py-2 gap-2"
                        >
                            <div className="min-w-0">
                                <div className="text-xs text-gray-900 dark:text-gray-100 truncate">
                                    {inviteUrl(inv.token)}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {inv.access_level === 'rw'
                                        ? t('shares.readWrite', 'Read & write')
                                        : t('shares.readOnly', 'Read only')}
                                    {' · '}
                                    {t('invites.expires', 'expires')}{' '}
                                    {new Date(
                                        inv.expires_at
                                    ).toLocaleDateString()}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => copy(inv.token)}
                                    className="p-1.5 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                                    title={t('invites.copyLink', 'Copy link')}
                                >
                                    {copiedToken === inv.token ? (
                                        <CheckIcon className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <ClipboardDocumentIcon className="h-4 w-4" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onRevoke(inv.token)}
                                    className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 dark:bg-transparent dark:text-red-400 dark:border-red-500"
                                >
                                    {t('shares.revoke', 'Revoke')}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default InviteLinkSection;
