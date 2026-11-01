import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type TokenEndpointAuthMethod =
  'none' | 'client_secret_post' | 'client_secret_basic';

/** OAuth clients of this installation: the web app (from config) and MCP hosts (dynamic registration). */
@Entity('oauth_clients')
export class OAuthClient {
  /** The client_id: `activate-web` for the web app, `dcr_…` for dynamically registered MCP hosts. */
  @PrimaryColumn('text') id: string;
  @Column('text') name: string;
  @Column('text', { array: true, default: '{}' }) redirectUris: string[];
  @Column('text', { default: 'none' })
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  /** sha256 of the client secret for confidential clients; null for public (PKCE) clients. */
  @Column('text', { nullable: true }) secretHash: string | null;
  @Column('text', { default: 'dcr' }) registeredBy: 'dcr' | 'config';
  @Column('text', {
    array: true,
    default: '{authorization_code,refresh_token}',
  })
  grantTypes: string[];
  @Column('timestamptz', { nullable: true }) disabledAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
