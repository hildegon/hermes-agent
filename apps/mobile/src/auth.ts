import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'

export const configured = Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_API_KEY)
const auth = configured && !Capacitor.isNativePlatform() ? getAuth(initializeApp({ apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID })) : null
export interface Account { uid: string; displayName: string | null; email: string | null }
export async function login() {
  if (!configured) throw new Error('Configura Firebase antes de iniciar sesión.')
  if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signInWithGoogle()
  else if (auth) await signInWithPopup(auth, new GoogleAuthProvider())
}
export async function logout() {
  if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut()
  else if (auth) await signOut(auth)
}
export async function idToken() {
  if (Capacitor.isNativePlatform()) return (await FirebaseAuthentication.getIdToken()).token
  if (!auth?.currentUser) throw new Error('Inicia sesión para conectar tus PC.')
  return auth.currentUser.getIdToken()
}
export async function watchAccount(callback: (account: Account | null) => void) {
  if (!configured) { callback(null); return () => {} }
  if (Capacitor.isNativePlatform()) {
    const listener = await FirebaseAuthentication.addListener('authStateChange', result => callback(result.user))
    callback((await FirebaseAuthentication.getCurrentUser()).user)
    return () => { void listener.remove() }
  }
  return auth ? onAuthStateChanged(auth, callback) : () => {}
}
