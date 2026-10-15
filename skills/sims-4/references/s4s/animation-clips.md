# Animation: RIG / CLIP / Events — claim-based reference

Conversion of `../s4s-animation-clips.md`. All evidence from the decompiled
S4S source at `/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/` (paths relative to
`S4Studio/`). Public-reference docs consulted:
`references/resource-types.md` (type IDs). Per-frame track codec details are
explicitly NOT decoded by S4S and remain unverified throughout.

---

## RIG resource

### RIG identity and versions
**Claim:** RigResource has type ID 2393838558 (0x8EAF13DE), a soft tooling
constant MAX_BONES = 180, supports version checks up to major 3, and defaults
new rigs to major 3, minor 1.
**Evidence — S4S implementation:** `Data/IO/Animation/RigResource.cs:20-22,142-143,176`
(`CheckVersion(3)`).
**Observed behavior:** Version fields are separate u32 Major + u32 Minor.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes for type ID (resource-types.md: _RIG
0x8EAF13DE, four sources); None documented for layout.
**Unknowns:** v4+ rig semantics.

### RIG serialized layout
**Claim:** Layout is VersionMajor u32, VersionMinor u32, BoneCount i32,
BoneCount bone records, then RigName as Pascal32 ASCII **only if
VersionMajor >= 4**, then IKChainCount i32 and that many IK chains.
**Evidence — S4S implementation:** `Data/IO/Animation/RigResource.cs:171-225`
(Read), `:227-253` (Write).
**Observed behavior:** Since S4S caps checks at major 3, the RigName branch is
effectively dead in this codebase.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** whether real game rigs carry major ≥ 4 (and thus a name field).

### RIG per-bone record
**Claim:** Each bone serializes as Position 3×float32 (X,Y,Z), Orientation
4×float32 (X,Y,Z,W), Scale 3×float32, Name Pascal32 ASCII (u32 length prefix +
bytes, no padding), OppositeIndex i32 (index into bones; −1 = none; Write uses
plain IndexOf which yields −1 for null), ParentIndex i32 (root unresolved when
out of range), NameHash u32 (FNV-1 32 of bone name, recomputed on write;
value skipped on read), Flags u32 (default 37180 = 0x913C for new bones).
**Evidence — S4S implementation:** `Data/IO/Animation/RigResource.cs:184-205,241`;
bone defaults at `Data/IO/Animation/Bone.cs:363`; Pascal string IO via
`Data/IO/Util/BinaryStreamWrapper.ReadPascalString(32,...)`.
**Observed behavior:** Hash is derived, not authoritative — recomputed from
the name.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** meaning of the Flags bit values beyond the default constant.

### Bone identity is FNV-32 of lowercase name
**Claim:** Bone identity in CLIP channels and slots is an FNV-32 hash of the
lowercase bone name; S4S maps hash→name through a global BoneNameProvider
cache.
**Evidence — S4S implementation:** `Data/IO/Animation/Bone.cs:353`;
`Data/IO/Animation/Channel.cs:138`.
**Observed behavior:** All cross-resource references (channels, slot rays,
events) resolve hashes through this cache.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none flagged.

### Rig helper behaviors
**Claim:** Numbered-name helper FindId("bone_#") finds the max existing
numeric suffix so RigBuilder.AddBone can allocate the next index;
"transformBone"/"transformBoneN" bones are located by name (TransformBone);
RigBuilder.AddIKTarget creates a bone AND registers a TargetSlot whose
BoneNameHash/NameHash = FNV32(bone name) with the bone's absolute transform.
Slot-style bones are classified by name pattern: `_ctnm_` containment slots
(ContainmentBoneSlot.Is), `_deco_<lrg|med|sml>_<n>` deco slots,
`_fx_<n>` effect slots, `b__subroot__<n>` subroots.
**Evidence — S4S implementation:** `Data/IO/Animation/RigResource.cs:161-169,255-269`;
`RigBuilder.cs:25-29,61-73`; wrappers `ContainmentBoneSlot.cs`,
`DecoBoneSlot.cs`, `EffectBoneSlot.cs`, `SubrootBoneSlot.cs`.
**Observed behavior:** Naming conventions drive tool behavior, not binary
fields.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial (slot naming conventions circulate in
community modding docs; not verified against those here).
**Unknowns:** none flagged.

### IK chain serialization with a read/write gate discrepancy
**Claim:** Each IKChain serializes BoneCount i32; ChainBone indices i32 ×
BoneCount; InfoNodes[11] i32 × 11 gated on VersionMajor ≥ 4 on Read but
VersionMinor ≥ 4 on Write; Pole i32 bone index; SlotInfo i32 (same ≥4
condition as InfoNodes); SlotOffset i32; Root i32. InfoNodes is always
allocated as Bone[11]. The read/write gate mismatch is inconsistent in the
decompiled source; treat v4+ semantics as not yet verified against game data.
**Evidence — S4S implementation:** `Data/IO/Animation/IKChain.cs:146,149-174,159,168,184,192`.
**Observed behavior:** Since S4S caps RIG version checks at 3, the ≥4 path
never executes normally.
**Confidence:** Implementation-verified (as written).
**Public-reference agreement:** None documented.
**Unknowns:** correct gating condition and v4+ IK chain layout.

### Animation boundary/constraint caches are opaque stubs
**Claim:** AnimationBoundaryConditionCacheResource (type 479834948 =
0x1C99B344) and AnimationConstraintCacheResource (type 3794048034 =
0xE2249422) both extend BasicResource with no Read/Write override — contents
not verified.
**Evidence — S4S implementation:** `Data/IO/Animation/AnimationBoundaryConditionCacheResource.cs`;
`AnimationConstraintCacheResource.cs`.
**Observed behavior:** Treated as opaque bytes.
**Confidence:** Hypothesis (existence verified; contents unknown).
**Public-reference agreement:** None documented.
**Unknowns:** entire payload format of both caches.

## CLIP resource

### ClipResource envelope identity and versions
**Claim:** ClipResource has type ID 1797309683 (0x6B20C4F3), max supported
version 18 (kMaxVersion; CheckVersion(18) on read and write), named versions
kSnap=14, kEventStringChangeVersion=16, kWerewolfVersion=17,
kHorseVersion=18, and new clips default to version 16.
**Evidence — S4S implementation:** `Data/IO/Animation/ClipResource.cs:21-31,425,488,574`.
**Observed behavior:** Auto version bump rules on write (:552-570): SnapEvent
B1≠0 → ≥18, SnapEvent F7≠0 → ≥14, Rig set → ≥17, surface hashes → ≥10,
ReferenceNamespaceHash → ≥5.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes for type ID (resource-types.md CLIP
0x6B20C4F3); None documented for layout.
**Unknowns:** none flagged.

### Clip envelope field order
**Claim:** Envelope order is: Version u32; Flags u32; Duration f32 (seconds);
InitialOffsetQ quaternion X,Y,Z,W f32×4; InitialOffsetT vector3 f32×3;
ReferenceNamespaceHash u32 (v≥5); SurfaceNamespaceHash u32 (v≥10);
SurfaceJointNameHash u32 (v≥10); SurfaceChildNamespaceHash u32 (v≥11);
ClipName Pascal32 UTF-8; ActorName Pascal32 UTF-8; ExplicitNamespaceCount i32
+ that many Pascal32 UTF-8 strings; SlotAssignmentCount i32 + records; 
EventCount u32 + per event (EventType u32, ByteSize i32, payload of ByteSize
bytes); Rig u64 instance id (v≥17); ClipDataSize u32 + embedded Clip blob.
**Evidence — S4S implementation:** `Data/IO/Animation/ClipResource.cs:484-548`
(Read).
**Observed behavior:** See §2.2/§2.3/§3 claims for substructures.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** envelope Flags bit meanings.

### Event string encoding switches at version 14
**Claim:** Event strings use Pascal32 when clip version > 14, otherwise a
fixed 128-byte zero-padded ASCII string (ReadString/WriteString in ClipEvent;
BinaryStreamWrapper.ReadFixedString(max=128)).
**Evidence — S4S implementation:** `Data/IO/Animation/ClipEvent.cs:102-121`;
`Data/IO/Util/BinaryStreamWrapper.cs:655-667`.
**Observed behavior:** Applies to every string field of every event class.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### SlotAssignment record
**Claim:** Each slot assignment serializes IkChainIndex int16,
IkChainTargetSequence int16, ActorName Pascal32 ASCII, TargetName Pascal32
ASCII.
**Evidence — S4S implementation:** `Data/IO/Animation/SlotAssignment.cs`.
**Observed behavior:** Stored in the clip envelope.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### Embedded Clip blob magic and header
**Claim:** The nested clip blob begins with the 8-byte ASCII magic `_pilC3S_`
(stored reversed of "_S3Clip_"), then Version u32 (CheckVersion(2)), Flags
u32, TickLength f32 (seconds per tick), TickCount u16, Padding u16,
ChannelCount u32, F1PaletteCount u32, four StreamPtr.BeginRead markers
written before channels/names/palette.
**Evidence — S4S implementation:** `Data/IO/Animation/Clip.cs:13,150-166,212-231`.
**Observed behavior:** Time base is TickLength × TickCount; event Timecode
fields elsewhere are float seconds.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** envelope-in-clip Padding word semantics.

### Channel headers
**Claim:** Each channel header is 12 bytes: Target u32 (bone FNV-32 hash or
other target), Offset f32 (dequantization offset), Scale f32 (dequantization
scale), FrameCount u16, ChannelType u8, ChannelSubTarget u8; each preceded by
its own StreamPtr marker.
**Evidence — S4S implementation:** `Data/IO/Animation/Channel.cs:146-155`
(Channel.Read).
**Observed behavior:** Offset/Scale imply quantized samples dequantized as
value*scale+offset.
**Confidence:** Implementation-verified (header); Hypothesis (dequantization
formula inferred from field names).
**Public-reference agreement:** None documented.
**Unknowns:** none for the header itself.

### Frame data is opaque — honesty claim
**Claim:** S4S stores frame data as opaque byte[] per channel and never
decodes it anywhere in the codebase (no FrameData decoder exists); the exact
per-sample bit layout, quantization, and interpolation scheme are NOT
verified from this source. What IS verified is the ChannelType enum listing
compression variants: 0 Unknown; 1–4 F1..F4; 5–8 F1_Normalized..F4_Normalized;
9–12 F1_Zero..F4_Zero; 13–16 F1_One..F4_One; 17
F4_QuaternionIdentity; 18 F3_HighPrecisionNormalized; 19
F4_HighPrecisionNormalized_Quaternion; 20 F4_SuperHighPrecision_Quaternion;
21 F3_HighPrecisionNormalized_Quaternion.
**Evidence — S4S implementation:** `Data/IO/Animation/Channel.cs:11-43`
(opaque storage); `Data/IO/Animation/ChannelType.cs`; frame-data split at
`Data/IO/Animation/Clip.cs:251-256`.
**Observed behavior:** Names strongly suggest reduced-component /
smallest-three quaternion storage, but the packing itself is not decoded here.
The remaining clip sections after channel headers: Name zero-delimited ASCII;
SourceAssetName zero-delimited ASCII; F1Palette float32 × F1PaletteCount
(shared scalar palette); FrameData split between consecutive channel markers.
**Confidence:** Implementation-verified (enum + opacity); Hypothesis
(smallest-three interpretation).
**Public-reference agreement:** None documented (community reverse-engineering
of track codecs exists but was not cross-checked here).
**Unknowns:** per-sample bit layouts for every ChannelType.

### SubTargetType vocabulary
**Claim:** SubTargetType tells what a channel animates: 0 Unknown; 1
Translation; 2 Orientation; 3 Scale; 4–6 Translation_X/Y/Z; 7–10
Orientation_X/Y/Z/W; 11–13 Scale_X/Y/Z; 14 IK_TargetWeight_World; 15–24
IK_TargetWeight_1…10; 25–44 IK_TargetOffset_Translation/Orientation
_World/_1…_10.
**Evidence — S4S implementation:** `Data/IO/Animation/SubTargetType.cs`.
**Observed behavior:** Stored in each channel header's final byte.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none within the enum.

### Quaternion primitive is plain float32 XYZW
**Claim:** DeserializeQuaternion/SerializeQuaternion write four IEEE float32
in order X, Y, Z, W — used by RIG bones, Clip InitialOffsetQ, and BonePose;
no smallest-three trick applies to these full quaternions.
**Evidence — S4S implementation:** `Data/IO/Core/Geometry/Sims4GeometryIOExt.cs:21-38`.
**Observed behavior:** Contrast with compressed track quaternions inside
channel frame data.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### ClipHeaderResource carries metadata without tracks
**Claim:** ClipHeaderResource (type 3158986820 = 0xBC4E1844) subclasses
ClipResource with an identical envelope format; its copy constructor keeps
only TickLength/TickCount/Names/Padding from the inner Clip, so the "clip
header" variant carries metadata + events without animation tracks; the copy
does not preserve the embedded blob verbatim and Write inherits the base
implementation.
**Evidence — S4S implementation:** `Data/IO/Animation/ClipHeaderResource.cs:10,39-45`.
**Observed behavior:** Note resource-types.md lists CLHD as 0xBC4A5044 while
this code uses 0xBC4E1844 — discrepancy worth flagging.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — community lists disagree with the
code's type ID (0xBC4A5044 vs 0xBC4E1844).
**Unknowns:** which ID real CLHD resources actually use.

## Clip event system

### Event framing and dispatch
**Claim:** Every event payload starts with a 12-byte header (Header1 u32,
Header2 u32, Timecode f32); events stored in the CLIP are (uint type, int
length, byte[] body); factory ClipEvent.Create maps types to classes, with
unknown types falling back to UnknownClipEvent which keeps the raw remainder
as byte[] Data.
**Evidence — S4S implementation:** `Data/IO/Animation/ClipEvent.cs:123-157`;
`UnknownClipEvent.cs:18-27`; framing in
`Data/IO/Animation/ClipResource.cs:523-536`.
**Observed behavior:** Unknown events survive round-trips losslessly.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** Header1/Header2 semantics.

### ClipEventType registry
**Claim:** The event-type enum spans regular clip events (values below) plus
TimelineEvents-only discriminators:

| Value | Name | Implemented class? |
|---|---|---|
| 0 | Invalid | — |
| 1 | Parent | ParentEvent |
| 2 | Unparent | (no class; falls to Unknown) |
| 3 | Sound | SoundEvent |
| 4 | Script | ScriptEvent (no extra fields) |
| 5 | Effect | EffectEvent |
| 6 | Visibility | VisibilityEvent |
| 7 | FootPlant | — |
| 8 | CreateProp | — |
| 9 | DestroyProp | DestroyPropEvent |
| 10 | StopEffect | StopEffectEvent |
| 11 | BlockTransition | BlockTransitionEvent |
| 12 | Snap | SnapEvent |
| 13 | Reaction | ReactionEvent |
| 14 | DoubleModifierSound | DoubleModifierSoundEffect |
| 15 | DspInterval | DspIntervalEvent |
| 16 | MaterialState | MaterialStateEvent |
| 17 | GeometryState | GeometryStateEvent |
| 18 | FocusCompatability | FocusCompatabilityEvent |
| 19 | SuppressLipSync | SuppressLipSyncEvent |
| 20 | Censor | CensorEvent |
| 21 | ServerSoundStart | ServerSoundStartEvent |
| 22 | ServerSoundStop | ServerSoundStopEvent |
| 23 | EnableFacialOverlay | EnableFacialOverlayEvent |
| 24 | FadeObject | FadeObjectEvent (`Shared/FadeObjectEvent.cs`) |
| 25 | DisableObjectHighlight | DisableObjectHighlightEvent |
| 26 | ThighTargetOffset | — |
| 28 | LocationSoundEvent | LocationSoundEvent (`Shared/LocationSoundEvent.cs`) |
| 29 | CameraTether | CameraTetherEvent (`Shared/CameraTetherEvent.cs`) |
| 30 | ThighTargetOffsetEx | ThighTargetOffsetExEvent (`Shared/ThighTargetOffsetExEvent.cs`) |
| 33 | DisableTailOverlay | DisableTailOverlayEvent (`Shared/DisableTailOverlayEvent.cs`) |
| 38 | TargetOffset | TargetOffsetEvent (`Shared/TargetOffsetEvent.cs`) |
| 39 | DisableWingsOverlay | — |
| 3433208315 | AdvanceFlipBook | TimelineEvents only |
| 3466999690 | TimelineScript | TimelineEvents only |
| 4151022839 | ClientLocationCapture | TimelineEvents only |
| 271806351 | ClientLocationRestore | TimelineEvents only |
| 125860765 | UnmuteLocomotionSoundEvent | TimelineEvents only |
| 1529737074 | OverrideReferenceMotionFrameRange | TimelineEvents only |
| 4141376721 | EnableLocomotionVFXEvent | TimelineEvents only |
| 224764180 | DisableLocomotionVFXEvent | TimelineEvents only |
| 759752963 | OverrideIKFrameRange | TimelineEvents only |
| 183557546 | PreFootstepEvent | TimelineEvents only |
| 2557353509 | DisableTerrainAlignmentFrameRange | TimelineEvents only |
| 2656752066 | MuteLocomotionSoundEvent | TimelineEvents only |
| 3122577492 | DisableDropShadowEvent | TimelineEvents only |
| 3396523771 | EnableDropShadowEvent | TimelineEvents only |

**Evidence — S4S implementation:** `Data/IO/Animation/ClipEventType.cs`.
**Observed behavior:** Values 27, 31, 32, 34–37 absent from the enum.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** payloads for the unimplemented types (FootPlant, CreateProp,
Unparent-as-CLIP, ThighTargetOffset, DisableWingsOverlay).

### Serialized fields per implemented event class
**Claim:** All string fields use the version-dependent rule (Pascal32 when
clip version > 14, else fixed 128-byte ASCII) and all classes inherit
Header1/Header2/Timecode; fields after the header are:

| Class | Fields after header |
|---|---|
| EffectEvent (EffectEvent.cs:157-181) | string EffectName; uint ActorNameHash; uint BoneNameHash; ulong U1; uint ActorNameHash2; uint BoneNameHash2; string SlotName |
| SoundEvent | string SoundName |
| VisibilityEvent | uint U1; byte Visible |
| ParentEvent | uint U1..U4; float F1..F6 |
| SnapEvent | uint U1; float F1..F6; float F7 (version ≥ 14); byte B1 (version ≥ 18) |
| DestroyPropEvent | uint U1 |
| StopEffectEvent | uint U1; uint U2; byte B1 |
| BlockTransitionEvent | float F1 |
| ReactionEvent | string s1; string s2 |
| DoubleModifierSoundEffect | string SoundEffect; uint ActorNameHashA; uint ActorNameHashB |
| DspIntervalEvent | float F1; string S1 |
| MaterialStateEvent | uint U1; string S1 |
| GeometryStateEvent | uint TargetASMPropNameHash; string GeometryState |
| FocusCompatabilityEvent | float F1; byte B1 |
| SuppressLipSyncEvent | float F1 |
| CensorEvent | byte CensorFlags |
| ServerSoundStartEvent | uint U1; string S1 |
| ServerSoundStopEvent | uint U1; string S1 |
| EnableFacialOverlayEvent | float F1 |
| DisableObjectHighlightEvent | float U1 (read/written as float despite name) |
| ScriptEvent | (none) |
| Shared/LocationSoundEvent | string S1; uint U1..U4 |
| Shared/FadeObjectEvent | uint U1; float F1; float F2 |
| Shared/CameraTetherEvent | uint U1 |
| Shared/ThighTargetOffsetExEvent | float F1..F7; uint U1 |
| Shared/DisableTailOverlayEvent | uint U1 |
| Shared/TargetOffsetEvent | float F1..F7; uint U1; uint U2; byte B1; string TargetSlot |

**Evidence — S4S implementation:** files under `Data/IO/Animation/` unless
noted `Shared/`, cited per row above.
**Observed behavior:** EffectEvent's BoneName property is derived — setting
it writes FNV.Hash32(name) into bone_name_hash; lookups go through
BoneNameProvider.LookupBone (EffectEvent.cs:70-84).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** U1/U2-style placeholder fields throughout (see
unknown-fields.md).

## BonePose / TrackMask

### BonePose resource
**Claim:** BonePoseResource (type 55959718 = 0x0355E0A6, extends
LinkedResource, version checked up to 1) serializes Version u32, DeltaCount
i32, then per delta a record of BoneNameHash u32 (FNV-32 of bone name),
Offset 3×f32 (default 0), Scale 3×f32 (default 1,1,1), Orientation 4×f32
X,Y,Z,W (default 0,0,0,1).
**Evidence — S4S implementation:** `Data/IO/Animation/BonePoseResource.cs:11,74,70-83`;
`Data/IO/Animation/BonePose.cs:112-119`.
**Observed behavior:** Static pose deltas keyed by bone hash.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none flagged.

### TrackMask resource
**Claim:** TrackMaskResource (type 53633251 = 0x033260E3) starts with a file
tag u32 = 1779481674 (0x6A10BC4A) validated on read, default write version 2,
then: Tag u32, Version u32, RigKey.Type u32, RigKey.Group u32, RigKey.Instance
u64, TrackCount u32, U1 u32, MaskCount u32, F1 f32, MaskValues f32 ×
(TrackCount × MaskCount) row-major.
**Evidence — S4S implementation:** `Data/IO/Animation/TrackMaskResource.cs:14,175,183-204,186-190`.
**Observed behavior:** Mask grid over tracks × masks.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** U1, F1.

## Sync points, state machines, locomotion

### SyncPoint & schema
**Claim:** A SyncPoint record is Target u32, Value f32, Timecode f32;
SyncPointSchemaResource (type 757559827 = 0x2D277213) is just Count i32
followed by that many SyncPoints.
**Evidence — S4S implementation:** `Data/IO/Animation/SyncPoint.cs:84-90`;
`SyncPointSchemaResource.cs:37-53`.
**Observed behavior:** Reused by TimelineEvents overrides.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### AnimationStateMachine is packed SimData
**Claim:** AnimationStateMachine (type 47570707 = 0x02D5DF13) is implemented
only as a SimDataPackedXmlResource subclass — parsed as packed XML/SimData
with no dedicated binary layout in this folder; internal schema not verified
here.
**Evidence — S4S implementation:** `Data/IO/Animation/AnimationStateMachine.cs`.
**Observed behavior:** Jazz graphs ride the generic packed-SimData reader.
**Confidence:** Implementation-verified (parsing route); Hypothesis (schema
contents).
**Public-reference agreement:** Yes for type ID (resource-types.md JAZZ
0x02D5DF13); None documented for schema.
**Unknowns:** the JAZZ SimData schema.

### Locomotion resources are XML containers
**Claim:** LocomotionBuilderResource (type 87703163 = 0x053A3E7B) is raw XML
with display name from root attribute `name`; LocomotionConfigResource
(type 2600355829 = 0x9AFE47F5) is plain XmlResource; WalkstyleResource
(type 666901909 = 0x27C01D95) is custom: first line is the asset key
terminated by byte 0xEF (start of a UTF-8 BOM EF BB BF), remainder is the XML
document. No locomotion runtime structures (gait graphs etc.) exist beyond
these containers.
**Evidence — S4S implementation:** `LocomotionBuilderResource.cs:12`;
`LocomotionConfigResource.cs`; `WalkstyleResource.cs:52-77`.
**Observed behavior:** All three wrap XML content.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** gait-graph runtime structures (not implemented anywhere here).

### TimelineEventsResource layout
**Claim:** TimelineEventsResource (type 111944783 = 0x06AC244F, version
checked ≤ 6) serializes Version u32; EventCount i32; per event a u32
ClipEventType discriminator then typed payload (**no** length prefix and
**no** 12-byte header/timecode, unlike in-CLIP events); OverrideCount i32;
per override u64 BaseSyncPointSchema and if ≠ 0 an i32 Count + Count ×
SyncPoint. Unknown discriminators throw NotSupportedException; the resource
links back to its owning clip header via Query.Find<ClipHeaderResource>(
Key.Instance).
**Evidence — S4S implementation:** `Data/IO/Animation/TimelineEventsResource.cs:1894,1962,1976-2028,2006,1980`.
**Observed behavior:** Distinct framing from CLIP-embedded events.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none flagged.

### TimelineEvents nested payloads
**Claim:** Nested ClipEventData payloads (all little-endian):

| Data class | Type enum | Payload |
|---|---|---|
| ParentEventData | Parent | uint U1..U7 |
| UnparentEventData | Unparent | uint U1..U7 |
| SoundEventData | Sound | uint U1..U3 |
| ScriptEventData | Script | uint U1..U4; float U5 |
| OverrideReferenceMotionFrameRangeData | OverrideReferenceMotionFrameRange | uint U1..U3; float Floats[19] (fixed array) |
| OverrideIKFrameRangeData | OverrideIKFrameRange | uint U1..U4 |
| AdvanceFlipbookEventData | AdvanceFlipBook | uint U1..U2 |
| TimelineScriptEventData | TimelineScript | uint U1..U3 |
| ClientLocationCaptureEventData | ClientLocationCapture | uint U1..U3 |
| ClientLocationRestoreEventData | ClientLocationRestore | uint U1..U3 |
| EnableLocomotionVFXEventData | EnableLocomotionVFXEvent | uint U1..U4; ushort U5 |
| DisableLocomotionVFXEventData | DisableLocomotionVFXEvent | uint U1..U4; ushort U5 |
| UnmuteLocomotionSoundEventData | UnmuteLocomotionSoundEvent | uint U1..U3 |
| MuteLocomotionSoundEventData | MuteLocomotionSoundEvent | uint U1..U3 |
| DisableTerrainAlignmentFrameRangeData | DisableTerrainAlignmentFrameRange | uint U1..U5 |
| PreFootstepEventData | PreFootstepEvent | uint U1..U2 |
| EnableDropShadowEventData | EnableDropShadowEvent | uint U1..U2 |
| DisableDropShadowEventData | DisableDropShadowEvent | uint U1..U2 |

**Evidence — S4S implementation:** `*EventData.cs` classes in
`Data/IO/Animation/` (TimelineEvents folder scope).
**Observed behavior:** Payload shapes differ markedly from their same-named
CLIP event counterparts.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** semantic meaning of nearly all U-fields above (see
unknown-fields.md).

## Misc utilities

### Pickle-based tuning dependency cache
**Claim:** PickleResource is an abstract BasicResource marker base;
TuningDependenciesCache (type 879540542) extends it and registers names
`td_pickle_cache[_py_unopt]_<pack>` in the resource-name cache; payload
format is pickled Python blobs, not verified.
**Evidence — S4S implementation:** `Data/IO/Animation/PickleResource.cs`
(+ TuningDependenciesCache class).
**Observed behavior:** Opaque pass-through.
**Confidence:** Implementation-verified (registration); Hypothesis (payload
semantics).
**Public-reference agreement:** None documented.
**Unknowns:** pickle payload structure.

### IBoneSlot contract
**Claim:** IBoneSlot is a minimal Name contract letting the slot-pattern
wrappers (_ctnm_, _deco_, _fx_, subroot) operate on both rig bones and other
slot carriers.
**Evidence — S4S implementation:** `Data/IO/Animation/IBoneSlot.cs`.
**Observed behavior:** Interface only; no serialization.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.
