import Peer from 'peerjs';
import { User, GameBoard } from '../types';
import { getBoards, saveSyncedBoards } from './storage';

// We use a deterministic ID based on username so devices can find each other
// ID format: buzzword-sync-v1-[sanitized-username]
const APP_PREFIX = 'buzzword-sync-v1-';

export class CloudSyncService {
    private peer: Peer | null = null;
    private user: User | null = null;
    private onSyncComplete: (() => void) | null = null;

    constructor() {}

    public init(user: User, onSyncComplete: () => void) {
        if (this.peer) this.peer.destroy();
        this.user = user;
        this.onSyncComplete = onSyncComplete;

        const sanitizedUser = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const primaryId = `${APP_PREFIX}${sanitizedUser}`;

        console.log(`[CloudSync] Attempting to become Primary Node: ${primaryId}`);

        // 1. Try to claim the Primary ID
        const peer = new Peer(primaryId);
        this.peer = peer;

        peer.on('open', (id) => {
            console.log(`[CloudSync] ACTIVE. Acting as Primary Node for ${user.username}.`);
            // We are the Primary (Laptop). Listen for Secondaries (Phones).
        });

        peer.on('connection', (conn) => {
            console.log(`[CloudSync] Incoming connection...`);
            conn.on('data', (data: any) => {
                if (data.type === 'SYNC_REQUEST') {
                    // Verify Password
                    if (data.password === this.user?.password) {
                        console.log(`[CloudSync] Password verified. Sending data.`);
                        const boards = getBoards(this.user.username);
                        conn.send({
                            type: 'SYNC_RESPONSE',
                            boards
                        });
                    } else {
                        console.warn(`[CloudSync] Password mismatch. Denying sync.`);
                        conn.send({ type: 'SYNC_DENIED' });
                    }
                }
            });
        });

        peer.on('error', (err: any) => {
            if (err.type === 'unavailable-id') {
                console.log(`[CloudSync] Primary ID taken. Another device is online. Connecting as Secondary...`);
                // 2. Primary ID is taken, so we must be the Secondary Device (Phone)
                this.connectAsSecondary(primaryId);
            } else {
                console.error(`[CloudSync] Peer Error:`, err);
            }
        });
    }

    private connectAsSecondary(primaryId: string) {
        // Create a random ID for the secondary
        const secondaryPeer = new Peer();
        this.peer = secondaryPeer;

        secondaryPeer.on('open', () => {
            console.log(`[CloudSync] Secondary Node Active. Connecting to Primary: ${primaryId}`);
            const conn = secondaryPeer.connect(primaryId);

            conn.on('open', () => {
                console.log(`[CloudSync] Connected to Primary. Requesting Data...`);
                conn.send({
                    type: 'SYNC_REQUEST',
                    password: this.user?.password
                });
            });

            conn.on('data', (data: any) => {
                if (data.type === 'SYNC_RESPONSE') {
                    console.log(`[CloudSync] Received ${data.boards.length} boards from Primary.`);
                    saveSyncedBoards(data.boards);
                    if (this.onSyncComplete) this.onSyncComplete();
                    // Close after sync to save resources? Or keep open?
                    // Keep open for updates? For now, one-time sync on login is safer.
                    conn.close();
                } else if (data.type === 'SYNC_DENIED') {
                    console.error(`[CloudSync] Sync Denied. Check password.`);
                    alert("Sync failed: Password mismatch with the other device.");
                }
            });
        });
    }

    public stop() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }
}

export const cloudSync = new CloudSyncService();
