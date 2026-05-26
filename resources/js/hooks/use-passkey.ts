import { router } from "@inertiajs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { dashboard } from "@/routes";
import {
	authenticate as authenticateRoute,
	options as authOptions,
} from "@/routes/passkey/auth";
import {
	options as registerOptions,
	store as registerStore,
} from "@/routes/passkey/register";

function base64urlToBuffer(base64url: string): ArrayBuffer {
	const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(
		base64.length + ((4 - (base64.length % 4)) % 4),
		"=",
	);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);

	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";

	for (const b of bytes) {
		binary += String.fromCharCode(b);
	}

	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

type PublicKeyCredentialWithResponse = PublicKeyCredential & {
	response: AuthenticatorAssertionResponse | AuthenticatorAttestationResponse;
};

function serializeCredential(
	credential: PublicKeyCredentialWithResponse,
): object {
	const resp = credential.response;
	const base: Record<string, unknown> = {
		id: credential.id,
		rawId: bufferToBase64url(credential.rawId),
		type: credential.type,
	};

	if (resp instanceof AuthenticatorAttestationResponse) {
		base.response = {
			attestationObject: bufferToBase64url(resp.attestationObject),
			clientDataJSON: bufferToBase64url(resp.clientDataJSON),
		};
	} else if (resp instanceof AuthenticatorAssertionResponse) {
		base.response = {
			authenticatorData: bufferToBase64url(resp.authenticatorData),
			clientDataJSON: bufferToBase64url(resp.clientDataJSON),
			signature: bufferToBase64url(resp.signature),
			userHandle: resp.userHandle ? bufferToBase64url(resp.userHandle) : null,
		};
	}

	return base;
}

function getXsrfToken(): string {
	const token = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];

	if (!token) {
		throw new Error("Session expired. Please refresh the page.");
	}

	return decodeURIComponent(token);
}

type WebAuthnCredentialDescriptor = {
	id: string;
	type: PublicKeyCredentialType;
	transports?: AuthenticatorTransport[];
};

type WebAuthnCreationOptions = {
	challenge: string;
	user: {
		id: string;
		name: string;
		displayName: string;
	};
	excludeCredentials?: WebAuthnCredentialDescriptor[];
	[key: string]: unknown;
};

type WebAuthnRequestOptions = {
	challenge: string;
	allowCredentials?: WebAuthnCredentialDescriptor[];
	[key: string]: unknown;
};

export type UsePasskeyReturn = {
	isSupported: boolean;
	loading: boolean;
	error: string | null;
	register: (name: string) => Promise<boolean>;
	authenticate: () => Promise<void>;
	startConditional: () => void;
	abortConditional: () => void;
};

export function usePasskey(): UsePasskeyReturn {
	const isSupported =
		typeof window !== "undefined" && !!window.PublicKeyCredential;
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const fetchOptions = useCallback(async (url: string) => {
		const res = await fetch(url, {
			headers: { Accept: "application/json" },
		});

		if (!res.ok) {
			throw new Error("Failed to fetch WebAuthn options");
		}

		return res.json() as Promise<unknown>;
	}, []);

	const prepareCreationOptions = useCallback(
		(raw: WebAuthnCreationOptions): PublicKeyCredentialCreationOptions => ({
			...(raw as unknown as Omit<
				PublicKeyCredentialCreationOptions,
				"challenge" | "user" | "excludeCredentials"
			>),
			challenge: base64urlToBuffer(raw.challenge),
			user: {
				...raw.user,
				id: base64urlToBuffer(raw.user.id),
			},
			excludeCredentials: (raw.excludeCredentials ?? []).map((c) => ({
				id: base64urlToBuffer(c.id),
				type: c.type,
				transports: c.transports,
			})),
		}),
		[],
	);

	const prepareRequestOptions = useCallback(
		(raw: WebAuthnRequestOptions): PublicKeyCredentialRequestOptions => ({
			...(raw as unknown as Omit<
				PublicKeyCredentialRequestOptions,
				"challenge" | "allowCredentials"
			>),
			challenge: base64urlToBuffer(raw.challenge),
			allowCredentials: (raw.allowCredentials ?? []).map((c) => ({
				id: base64urlToBuffer(c.id),
				type: c.type,
				transports: c.transports,
			})),
		}),
		[],
	);

	const register = useCallback(
		async (name: string): Promise<boolean> => {
			if (!isSupported) {
				return false;
			}

			setLoading(true);
			setError(null);

			try {
				const raw = await fetchOptions(registerOptions.url());
				const options = prepareCreationOptions(raw as WebAuthnCreationOptions);
				const credential = (await navigator.credentials.create({
					publicKey: options,
				})) as PublicKeyCredentialWithResponse | null;

				if (!credential) {
					throw new Error("No credential returned");
				}

				const res = await fetch(registerStore.url(), {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						"X-XSRF-TOKEN": getXsrfToken(),
					},
					body: JSON.stringify({
						name,
						...serializeCredential(credential),
					}),
				});

				if (!res.ok) {
					const body = (await res.json()) as { message?: string };

					throw new Error(body.message ?? "Registration failed");
				}

				return true;
			} catch (e: unknown) {
				if (e instanceof Error && e.name !== "NotAllowedError") {
					setError(e.message);
				}

				return false;
			} finally {
				setLoading(false);
			}
		},
		[isSupported, fetchOptions, prepareCreationOptions],
	);

	const runAuthentication = useCallback(
		async (
			mediation: CredentialMediationRequirement,
			signal?: AbortSignal,
		): Promise<void> => {
			const raw = await fetchOptions(authOptions.url());
			const options = prepareRequestOptions(raw as WebAuthnRequestOptions);
			const credential = (await navigator.credentials.get({
				publicKey: options,
				mediation,
				signal,
			})) as PublicKeyCredentialWithResponse | null;

			if (!credential) {
				return;
			}

			const res = await fetch(authenticateRoute.url(), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					"X-XSRF-TOKEN": getXsrfToken(),
				},
				body: JSON.stringify(serializeCredential(credential)),
			});

			if (!res.ok) {
				const body = (await res.json()) as { message?: string };

				throw new Error(body.message ?? "Authentication failed");
			}

			const body = (await res.json()) as { redirect?: string };
			router.visit(body.redirect ?? dashboard.url());
		},
		[fetchOptions, prepareRequestOptions],
	);

	const authenticate = useCallback(async (): Promise<void> => {
		if (!isSupported) {
			return;
		}

		setLoading(true);
		setError(null);

		try {
			await runAuthentication("optional");
		} catch (e: unknown) {
			if (e instanceof Error && e.name !== "NotAllowedError") {
				setError(e.message);
			}
		} finally {
			setLoading(false);
		}
	}, [isSupported, runAuthentication]);

	const startConditional = useCallback((): void => {
		if (!isSupported) {
			return;
		}

		abortRef.current?.abort();
		abortRef.current = new AbortController();
		runAuthentication("conditional", abortRef.current.signal).catch(
			(e: unknown) => {
				if (e instanceof Error && e.name !== "AbortError") {
					setError(e.message);
				}
			},
		);
	}, [isSupported, runAuthentication]);

	const abortConditional = useCallback((): void => {
		abortRef.current?.abort();
	}, []);

	useEffect(() => {
		return () => abortRef.current?.abort();
	}, []);

	return {
		isSupported,
		loading,
		error,
		register,
		authenticate,
		startConditional,
		abortConditional,
	};
}
