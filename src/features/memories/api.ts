import { supabase } from '../../lib/supabase'

export type KeyringStatus = 'unpaired' | 'active' | 'pending_transfer' | 'transfer_ready' | 'transferred'

export type Keyring = {
  id: string
  owner_id: string | null
  created_by_id: string | null
  public_id: string
  name: string
  status: KeyringStatus
  created_at: string
  paired_at: string | null
  transferred_at: string | null
}

export type KeyringSummary = Keyring & { memory_count: number }

export type CreatedKeyring = {
  id: string
  public_id: string
  name: string
  status: 'unpaired'
  created_at: string
}

export type CreatedKeyringLink = {
  id: string
  public_id: string
  name: string
  status: 'unpaired'
  created_at: string
}

export type KeyringState = {
  exists: boolean
  id?: string
  public_id?: string
  status?: KeyringStatus
  is_owner?: boolean
  is_creator?: boolean
  name?: string | null
  memory_count?: number | null
  pairing_expires_at?: string | null
  transfer_id?: string | null
  transfer_expires_at?: string | null
}

export type MemoryEntry = {
  id: string
  owner_id: string
  keyring_id: string | null
  text_content: string
  image_path: string | null
  status: 'draft' | 'transferred'
  created_at: string
  transferred_at: string | null
}

export type WorldRegion = {
  id: string
  transfer_id: string
  region_type: 'cafe' | 'park' | 'garden' | 'street'
  name: string
  map_data: {
    version: number
    template: string
    grid: { columns: number; rows: number }
    objects: Array<{ memory_id: string; x: number; y: number; kind: 'photo' | 'letter' }>
  }
  created_at: string
}

function getClient() {
  if (!supabase) throw new Error('Supabase 환경 설정을 확인해주세요.')
  return supabase
}

export async function fetchMyKeyrings(): Promise<Keyring[]> {
  const client = getClient()
  const { data, error } = await client
    .from('keyrings')
    .select('id, owner_id, created_by_id, public_id, name, status, created_at, paired_at, transferred_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Keyring[]
}

export async function fetchMyKeyringsWithCounts(userId: string): Promise<KeyringSummary[]> {
  const client = getClient()
  const keyrings = await fetchMyKeyrings()
  if (keyrings.length === 0) return []

  const keyringIds = keyrings.map((keyring) => keyring.id)
  const { data: memories, error: memoriesError } = await client
    .from('memory_entries')
    .select('keyring_id')
    .eq('owner_id', userId)
    .in('keyring_id', keyringIds)
  if (memoriesError) throw memoriesError

  const memoryCounts = new Map<string, number>()
  for (const memory of memories ?? []) {
    if (memory.keyring_id) {
      memoryCounts.set(memory.keyring_id, (memoryCounts.get(memory.keyring_id) ?? 0) + 1)
    }
  }

  return keyrings.map((keyring) => ({
    ...keyring,
    memory_count: memoryCounts.get(keyring.id) ?? 0,
  })) as KeyringSummary[]
}

export async function createUnpairedKeyring(name?: string): Promise<CreatedKeyring> {
  const { data, error } = await getClient().rpc('admin_create_unpaired_keyring', {
    p_name: name ?? '나의 추억 키링',
  })
  if (error) throw error
  return data as CreatedKeyring
}

export async function createKeyringLink(name?: string): Promise<CreatedKeyringLink> {
  const { data, error } = await getClient().rpc('create_keyring_link', {
    p_name: name ?? 'Poom 키링',
  })
  if (error) throw error
  return data as CreatedKeyringLink
}

export async function activateKeyring(publicId: string) {
  const { data, error } = await getClient().rpc('activate_keyring', { p_public_id: publicId })
  if (error) throw error
  return data as { ok: boolean; error?: string; status?: string }
}

export async function fetchKeyringState(publicId: string): Promise<KeyringState> {
  const { data, error } = await getClient().rpc('get_keyring_state', {
    p_public_id: publicId,
  })
  if (error) throw error
  return (data ?? { exists: false }) as KeyringState
}

export async function fetchMyMemories(userId: string, status?: MemoryEntry['status']) {
  let query = getClient()
    .from('memory_entries')
    .select('id, owner_id, keyring_id, text_content, image_path, status, created_at, transferred_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as MemoryEntry[]
}

export async function fetchKeyringMemories(keyringId: string, status?: MemoryEntry['status']) {
  let query = getClient()
    .from('memory_entries')
    .select('id, owner_id, keyring_id, text_content, image_path, status, created_at, transferred_at')
    .eq('keyring_id', keyringId)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as MemoryEntry[]
}

export async function saveMemory(input: {
  id: string
  ownerId: string
  keyringId: string
  text: string
  photo: File | null
}) {
  const client = getClient()
  const extension = input.photo?.type === 'image/png' ? 'png' : input.photo ? 'jpg' : null
  const imagePath = extension ? `${input.keyringId}/${input.id}/photo.${extension}` : null
  const { error: insertError } = await client.from('memory_entries').insert({
    id: input.id,
    owner_id: input.ownerId,
    keyring_id: input.keyringId,
    text_content: input.text.trim(),
    image_path: imagePath,
  })
  if (insertError) throw insertError

  if (input.photo && imagePath) {
    const { error: uploadError } = await client.storage
      .from('memory-photos')
      .upload(imagePath, input.photo, {
        contentType: input.photo.type,
        cacheControl: '60',
        upsert: false,
      })
    if (uploadError) {
      await client.from('memory_entries').delete().eq('id', input.id)
      throw uploadError
    }
  }
}

export async function deleteMemory(memory: MemoryEntry) {
  const client = getClient()
  if (memory.image_path) {
    const { error: imageError } = await client.storage.from('memory-photos').remove([memory.image_path])
    if (imageError) throw imageError
  }
  const { error } = await client.from('memory_entries').delete().eq('id', memory.id)
  if (error) throw error
}

export async function fetchPhotoUrl(memoryId: string) {
  const { data, error } = await getClient().functions.invoke<{ signed_url: string }>('memory-photo-url', {
    body: { memory_id: memoryId },
  })
  if (error) throw error
  if (!data?.signed_url) throw new Error('사진 주소를 발급받지 못했습니다.')
  return data.signed_url
}

export type TransferSession = {
  transfer_id: string
  expires_at: string
  reused: boolean
  memory_count?: number
  status?: string
}

export async function createTransfer(input: { publicId: string; idempotencyKey: string }) {
  const { data, error } = await getClient().functions.invoke<TransferSession>('create-transfer', {
    body: { public_id: input.publicId, idempotency_key: input.idempotencyKey },
  })
  if (error) {
    const response = 'context' in error && error.context instanceof Response ? error.context : null
    if (response) {
      const body = await response.clone().json().catch(() => null) as { error?: unknown } | null
      if (typeof body?.error === 'string') throw new Error(body.error, { cause: error })
    }
    throw error
  }
  if (!data?.transfer_id) throw new Error('전달 준비를 시작하지 못했습니다.')
  return data
}

export async function cancelTransfer(publicId: string) {
  const { data, error } = await getClient().rpc('cancel_keyring_transfer_ready', {
    p_public_id: publicId,
  })
  if (error) throw error
  return data as { ok: boolean; error?: string; status?: string }
}

export type ReceiveResult = {
  ok: boolean
  error?: string
  attempts_remaining?: number
  regions?: Array<{ id: string; region_type: WorldRegion['region_type']; name: string }>
  memory_count?: number
}

export async function receiveTransfer(publicId: string) {
  const { data, error } = await getClient().functions.invoke<ReceiveResult>('receive-transfer', {
    body: { public_id: publicId },
  })
  if (error) throw error
  if (!data) throw new Error('전달을 완료하지 못했습니다.')
  return data
}

export async function fetchWorld(userId: string) {
  const client = getClient()
  const [regionsResult, memoriesResult] = await Promise.all([
    client.from('world_regions')
      .select('id, transfer_id, region_type, name, map_data, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true }),
    client.from('memory_entries')
      .select('id, owner_id, keyring_id, text_content, image_path, status, created_at, transferred_at')
      .eq('owner_id', userId)
      .eq('status', 'transferred')
      .order('created_at', { ascending: true }),
  ])
  if (regionsResult.error) throw regionsResult.error
  if (memoriesResult.error) throw memoriesResult.error
  return {
    regions: (regionsResult.data ?? []) as WorldRegion[],
    memories: (memoriesResult.data ?? []) as MemoryEntry[],
  }
}
