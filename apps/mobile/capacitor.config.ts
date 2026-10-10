import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'io.hildegon.hermesmobile', appName: 'Hermes Mobile', webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: { FirebaseAuthentication: { skipNativeAuth: false, providers: ['google.com'] } },
}
export default config
