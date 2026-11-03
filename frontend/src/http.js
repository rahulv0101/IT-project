/** Keep connection failures readable without changing server validation errors. */
export async function appFetch(input, options) {
  try {
    const response = await fetch(input, options);
    if (response.status === 401 && typeof response.clone === 'function') {
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      if (body?.error?.code === 'UNAUTHENTICATED')
        window.dispatchEvent(new Event('eduquest:session-expired'));
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(
      navigator.onLine === false
        ? 'You’re offline. Reconnect and try again.'
        : 'We couldn’t connect to EduQuest. Please try again.',
    );
  }
}
