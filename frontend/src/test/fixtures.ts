import type {
  FaceScanStatus,
  Group,
  MediaItem,
  MediaPage,
  Person,
  SyncStatus,
} from '#/api/schemas'

let _id = 1
const nextId = () => _id++

export function makeMediaItem(overrides?: Partial<MediaItem>): MediaItem {
  const id = nextId()
  return {
    id,
    message_id: id,
    chat_id: 1,
    chat_name: 'Test Chat',
    date: '2026-01-15T12:00:00Z',
    media_type: 'photo',
    mime_type: 'image/jpeg',
    file_size: 102400,
    width: 1920,
    height: 1080,
    duration: null,
    caption: null,
    thumbnail_path: `/thumbs/${id}.jpg`,
    sender_name: 'Alice',
    hidden_at: null,
    favorited_at: null,
    ...overrides,
  }
}

export function makeGroup(overrides?: Partial<Group>): Group {
  const id = nextId()
  return {
    id,
    name: `Group ${id}`,
    type: 'group',
    unread_count: 0,
    active: true,
    last_synced: null,
    hidden_at: null,
    ...overrides,
  }
}

export function makePerson(overrides?: Partial<Person>): Person {
  const id = nextId()
  return {
    id,
    name: `Person ${id}`,
    display_name: `Person ${id}`,
    representative_face_id: null,
    face_count: 3,
    avatar_crop_path: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeSyncStatus(overrides?: Partial<SyncStatus>): SyncStatus {
  return {
    status: 'idle',
    progress: 0,
    total: 0,
    ...overrides,
  }
}

export function makeFaceScanStatus(
  overrides?: Partial<FaceScanStatus>,
): FaceScanStatus {
  return {
    status: 'idle',
    scanned: 0,
    total: 0,
    person_count: 0,
    ...overrides,
  }
}

export function makeMediaPage(
  items: MediaItem[],
  nextCursor?: string | null,
): MediaPage {
  return {
    items,
    next_cursor: nextCursor ?? null,
  }
}
