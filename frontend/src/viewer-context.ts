/** getRandomValues also works on internal HTTP hosts without randomUUID. */
export function viewerContextId():string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
}
