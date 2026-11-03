/** Keep connection failures readable without changing server validation errors. */
export async function appFetch(input, options) {
  try {
    return await fetch(input, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(
      navigator.onLine === false
        ? 'You’re offline. Reconnect and try again.'
        : 'We couldn’t connect to EduQuest. Please try again.',
    );
  }
}
