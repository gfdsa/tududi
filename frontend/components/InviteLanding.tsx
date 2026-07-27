import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EnvelopeOpenIcon } from '@heroicons/react/24/outline';
import {
    acceptInvitation,
    consumePendingInvite,
    InvitationPreview,
    previewInvitation,
    storePendingInvite,
} from '../utils/invitationsService';

interface InviteLandingProps {
    authenticated: boolean;
}

/**
 * Landing page for /invite/:token.
 *
 * Unauthenticated: shows what the visitor was invited to, remembers the
 * token (it survives the login/register/OIDC round-trips via localStorage)
 * and sends them to authenticate.
 *
 * Authenticated: redeems the token and redirects to the shared resource.
 */
const InviteLanding: React.FC<InviteLandingProps> = ({ authenticated }) => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [preview, setPreview] = useState<InvitationPreview | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;

        if (authenticated) {
            acceptInvitation(token)
                .then((result) => {
                    consumePendingInvite();
                    const path =
                        result.resource_type === 'area'
                            ? `/area/${result.resource_uid}`
                            : `/project/${result.resource_uid}`;
                    navigate(path, { replace: true });
                })
                .catch((err) => {
                    consumePendingInvite();
                    setError(err.message);
                });
            return;
        }

        storePendingInvite(token);
        previewInvitation(token)
            .then(setPreview)
            .catch((err) => setError(err.message));
    }, [token, authenticated]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center">
                <EnvelopeOpenIcon className="h-12 w-12 mx-auto text-blue-500 mb-4" />
                {error ? (
                    <>
                        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                            {t('invites.invalidTitle', 'Invitation not valid')}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            {error}
                        </p>
                        <Link
                            to="/"
                            className="text-blue-600 dark:text-blue-400 underline text-sm"
                        >
                            {t('invites.goHome', 'Go to tududi')}
                        </Link>
                    </>
                ) : authenticated ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('invites.accepting', 'Accepting invitation…')}
                    </p>
                ) : preview ? (
                    <>
                        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                            {t('invites.title', 'You have been invited')}
                        </h1>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                            {preview.inviter_name}{' '}
                            {t('invites.invitesYouTo', 'invites you to')}{' '}
                            {preview.resource_type === 'area'
                                ? t('invites.theArea', 'the area')
                                : t('invites.theProject', 'the project')}
                        </p>
                        <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                            “{preview.resource_name}”
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                            {preview.access_level === 'rw'
                                ? t('shares.readWrite', 'Read & write')
                                : t('shares.readOnly', 'Read only')}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            {t(
                                'invites.signInPrompt',
                                'Sign in or create an account to accept.'
                            )}
                        </p>
                        <div className="flex gap-3 justify-center">
                            <Link
                                to="/login"
                                className="px-4 py-2 rounded bg-blue-600 text-white text-sm"
                            >
                                {t('auth.signIn', 'Sign in')}
                            </Link>
                            <Link
                                to={`/register?invite=${token}`}
                                className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
                            >
                                {t('auth.register', 'Register')}
                            </Link>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('common.loading', 'Loading...')}
                    </p>
                )}
            </div>
        </div>
    );
};

export default InviteLanding;
