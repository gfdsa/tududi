import { getApiPath } from '../config/paths';
import { getCsrfToken } from './csrfService';

export type InviteResourceType = 'project' | 'area';
export type InviteAccessLevel = 'ro' | 'rw';

export interface Invitation {
    token: string;
    access_level: InviteAccessLevel;
    expires_at: string;
    email: string | null;
    used_count: number;
    active: boolean;
}

export interface InvitationPreview {
    resource_type: InviteResourceType;
    resource_name: string;
    access_level: InviteAccessLevel;
    inviter_name: string | null;
    invited_email: string | null;
}

const PENDING_INVITE_KEY = 'pending_invite_token';

export const storePendingInvite = (token: string): void => {
    localStorage.setItem(PENDING_INVITE_KEY, token);
};

export const consumePendingInvite = (): string | null => {
    const token = localStorage.getItem(PENDING_INVITE_KEY);
    if (token) localStorage.removeItem(PENDING_INVITE_KEY);
    return token;
};

export const peekPendingInvite = (): string | null =>
    localStorage.getItem(PENDING_INVITE_KEY);

async function parseError(res: Response, fallback: string): Promise<Error> {
    let message = fallback;
    try {
        const body = await res.json();
        if (body?.error) message = body.error;
    } catch {
        // ignore non-JSON error bodies
    }
    return new Error(message);
}

export const createInvitation = async (params: {
    resource_type: InviteResourceType;
    resource_uid: string;
    access_level: InviteAccessLevel;
    email?: string;
}): Promise<{ token: string; url: string; email: string | null }> => {
    const res = await fetch(getApiPath('invitations'), {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify(params),
    });
    if (!res.ok) throw await parseError(res, 'Failed to create invitation');
    return res.json();
};

export const listInvitations = async (
    resourceType: InviteResourceType,
    resourceUid: string
): Promise<Invitation[]> => {
    const params = new URLSearchParams({
        resource_type: resourceType,
        resource_uid: resourceUid,
    });
    const res = await fetch(getApiPath(`invitations?${params.toString()}`), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw await parseError(res, 'Failed to load invitations');
    const data = await res.json();
    return data.invitations || [];
};

export const revokeInvitation = async (token: string): Promise<void> => {
    const res = await fetch(getApiPath(`invitations/${token}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'x-csrf-token': await getCsrfToken(),
        },
    });
    if (!res.ok) throw await parseError(res, 'Failed to revoke invitation');
};

export const previewInvitation = async (
    token: string
): Promise<InvitationPreview> => {
    const res = await fetch(getApiPath(`invitations/${token}/preview`), {
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw await parseError(res, 'Invitation not found');
    return res.json();
};

export const acceptInvitation = async (
    token: string
): Promise<{
    resource_type: InviteResourceType;
    resource_uid: string;
    resource_name: string;
}> => {
    const res = await fetch(getApiPath(`invitations/${token}/accept`), {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'x-csrf-token': await getCsrfToken(),
        },
    });
    if (!res.ok) throw await parseError(res, 'Failed to accept invitation');
    return res.json();
};
