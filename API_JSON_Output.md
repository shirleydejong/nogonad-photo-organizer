# Sony Camera Remote API - JSON Output Documentation

## Overview
The `get_settings` command returns a comprehensive JSON object containing all current camera settings and their possible values.

## Command Usage
```bash
get_settings
```

## JSON Output Structure

### Complete Example
```json
{
  "exposure_mode": {
	"current": "M (Memory Recall)",
	"available": ["P_Auto", "A_AperturePriority", "S_ShutterSpeedPriority", "M_Manual", "M (Memory Recall)"]
  },
  "memory_recall_available": true,
  "memory_recall_active": true,
  "file_format": "RAW+JPEG",
  "image_quality": "Fine",
  "image_size": "Large",
  "aspect_ratio": "3:2",
  "focus_mode": "AF-C",
  "focus_area": "Wide",
  "subject_recognition_af": "On",
  "subject_recognition_target": "Human",
  "eye_detection_enabled": true,
  "eye_selection": "Auto",
  "touch_focus": "On",
  "metering_mode": "Multi",
  "exposure_compensation": "+0.3 EV",
  "iso": "400",
  "shutter_speed": "1/125",
  "aperture": "F5.6"
}
```

---

## Field Definitions

### `exposure_mode`
**Type:** Object  
**Description:** The camera's exposure program mode

#### Structure
```json
"exposure_mode": {
  "current": "string",
  "available": ["string", "string", ...]
}
```

#### Possible Values
| Value | Description |
|-------|-------------|
| `M_Manual` | Manual exposure mode - full control over shutter speed and aperture |
| `P_Auto` | Program Auto - camera selects shutter speed and aperture |
| `A_AperturePriority` | Aperture Priority - you set aperture, camera sets shutter speed |
| `S_ShutterSpeedPriority` | Shutter Speed Priority - you set shutter speed, camera sets aperture |
| `M (Memory Recall)` | Memory Recall mode (M1/M2/M3) - recalls saved settings |
| `ProgramCreative` | Program Creative mode |
| `ProgramAction` | Program Action mode |
| `Portrait` | Portrait scene mode |
| `Auto` | Intelligent Auto mode |
| `Auto_Plus` | Intelligent Auto Plus mode |
| `P_A` | P_A mode |
| `P_S` | P_S mode |
| `Sports_Action` | Sports Action scene mode |
| `Sunset` | Sunset scene mode |
| `Night` | Night scene mode |
| `Landscape` | Landscape scene mode |
| `Macro` | Macro scene mode |
| `HandheldTwilight` | Handheld Twilight scene mode |
| `NightPortrait` | Night Portrait scene mode |
| `AntiMotionBlur` | Anti Motion Blur mode |
| `Pet` | Pet scene mode |
| `Gourmet` | Gourmet scene mode |
| `Fireworks` | Fireworks scene mode |
| `HighSensitivity` | High Sensitivity mode |

**Note:** The `available` array contains only modes supported by your specific camera model.

---

### `memory_recall_available`
**Type:** Boolean  
**Description:** Indicates whether the camera supports Memory Recall (M1/M2/M3) modes

#### Possible Values
- `true` - Memory Recall is available on this camera
- `false` - Memory Recall is not available on this camera

---

### `memory_recall_active`
**Type:** Boolean  
**Description:** Indicates whether a Memory Recall mode is currently active

#### Possible Values
- `true` - Camera is currently using a Memory Recall preset (M1, M2, or M3)
- `false` - Camera is not in Memory Recall mode

**Note:** The SDK does not provide the specific memory slot number (1, 2, or 3), only that Memory Recall is active.

---

### `file_format`
**Type:** String  
**Description:** The file format for still images

#### Possible Values
| Value | Description |
|-------|-------------|
| `JPEG` | JPEG format only |
| `RAW` | RAW format only (ARW for Sony) |
| `RAW+JPEG` | Both RAW and JPEG files are saved |
| `HEIF` | HEIF format only |
| `RAW+HEIF` | Both RAW and HEIF files are saved |
| `Unknown` | Format cannot be determined |

---

### `image_quality`
**Type:** String  
**Description:** The compression quality for JPEG/HEIF images

#### Possible Values
| Value | Description | Typical Use |
|-------|-------------|-------------|
| `Light` | Low quality, high compression | Maximum storage efficiency |
| `Standard` | Standard quality | General shooting |
| `Fine` | High quality, low compression | High-quality images |
| `Extra Fine` | Maximum quality, minimal compression | Professional work |
| `Unknown` | Quality cannot be determined | - |

**Note:** This setting only affects JPEG and HEIF files, not RAW files.

---

### `image_size`
**Type:** String  
**Description:** The resolution/size of captured images

#### Possible Values
| Value | Description | Typical Resolution |
|-------|-------------|-------------------|
| `Large` | Maximum resolution | Full sensor megapixels (e.g., 24MP, 33MP, 61MP) |
| `Medium` | Medium resolution | Approximately 50% of full resolution |
| `Small` | Small resolution | Approximately 25% of full resolution |
| `VGA` | VGA resolution | 640×480 pixels |
| `Unknown` | Size cannot be determined | - |

**Note:** Actual megapixels depend on your camera model and aspect ratio setting.

---

### `aspect_ratio`
**Type:** String  
**Description:** The aspect ratio of captured images

#### Possible Values
| Value | Description | Common Use |
|-------|-------------|-----------|
| `3:2` | 3:2 aspect ratio | Standard for full-frame and APS-C sensors |
| `16:9` | 16:9 aspect ratio | Widescreen/video format |
| `4:3` | 4:3 aspect ratio | Micro Four Thirds standard |
| `1:1` | 1:1 aspect ratio | Square format (Instagram) |
| `Unknown` | Aspect ratio cannot be determined | - |

---

### `focus_mode`
**Type:** String  
**Description:** The autofocus mode of the camera

#### Possible Values
| Value | Description |
|-------|-------------|
| `MF` | Manual Focus - focus manually |
| `AF-S` | Single-shot AF - locks focus when half-pressing shutter |
| `AF-C` | Continuous AF - continuously adjusts focus |
| `AF-A` | Automatic AF - camera selects AF-S or AF-C |
| `DMF` | Direct Manual Focus - AF then manual fine-tune |
| `Unknown` | Focus mode cannot be determined |

**Note:** Available modes vary by camera model.

---

### `focus_area`
**Type:** String  
**Description:** The AF area/focus point configuration

#### Possible Values
| Value | Description |
|-------|-------------|
| `Wide` | Camera selects focus area automatically across wide zone |
| `Zone` | Focus limited to selected zone |
| `Center` | Focus on center point |
| `Flexible_Spot_S` | Small flexible spot - precise focus point |
| `Flexible_Spot_M` | Medium flexible spot |
| `Flexible_Spot_L` | Large flexible spot |
| `Expand_Flexible_Spot` | Flexible spot with surrounding assist points |
| `Tracking_Wide` | Wide area with subject tracking |
| `Tracking_Zone` | Zone-based subject tracking |
| `Tracking_Center` | Center-based subject tracking |
| `Tracking_Flexible_Spot_S` | Small spot with tracking |
| `Tracking_Flexible_Spot_M` | Medium spot with tracking |
| `Tracking_Flexible_Spot_L` | Large spot with tracking |
| `Unknown` | Focus area cannot be determined |

**Note:** Available options depend on camera model and firmware.

---

### `subject_recognition_af`
**Type:** String  
**Description:** Whether subject recognition (human/animal eye AF) is enabled

#### Possible Values
| Value | Description |
|-------|-------------|
| `On` | Subject recognition is active (detects humans, animals, birds, etc.) |
| `Off` | Subject recognition is disabled |

**Note:** When enabled, the camera automatically detects and tracks subjects like human faces/eyes, animal eyes, and bird eyes.

---

### `subject_recognition_target`
**Type:** String  
**Description:** Which subject type is selected for subject recognition AF

#### Possible Values
| Value | Description |
|-------|-------------|
| `Auto` | Camera automatically chooses subject type |
| `Human` | Prioritize people (face/eye detection) |
| `Animal/Bird` | Combined animal + bird detection mode |
| `Animal` | Prioritize animals |
| `Bird` | Prioritize birds |
| `Insect` | Prioritize insects |
| `Car/Train` | Prioritize cars and trains |
| `Plane` | Prioritize airplanes |
| `Unknown` | Subject type cannot be determined |

---

### `eye_detection_enabled`
**Type:** Boolean  
**Description:** Indicates whether eye detection is enabled in AF

#### Possible Values
- `true` - Eye detection is enabled
- `false` - Eye detection is disabled

---

### `eye_selection`
**Type:** String  
**Description:** Preferred eye selection for eye AF

#### Possible Values
| Value | Description |
|-------|-------------|
| `Auto` | Camera automatically selects the eye |
| `Right` | Prioritize right eye |
| `Left` | Prioritize left eye |
| `Unknown` | Eye selection cannot be determined |

---

### `touch_focus`
**Type:** String  
**Description:** The status of touch-to-focus operation on the rear screen

#### Possible Values
| Value | Description |
|-------|-------------|
| `On` | Touch focus is enabled - tap screen to set focus point |
| `Off` | Touch focus is disabled |
| `Playback Only` | Touch only works during image playback, not for shooting |

---

### `metering_mode`
**Type:** String  
**Description:** The exposure metering mode

#### Possible Values
| Value | Description |
|-------|-------------|
| `Multi` | Multi-segment metering - evaluates entire scene |
| `Center Weighted` | Center-weighted metering - emphasizes center area |
| `Entire Screen Average` | Averages entire screen uniformly |
| `Spot Standard` | Spot metering - small center area |
| `Spot Large` | Larger spot metering area |
| `Highlight Weighted` | Prioritizes highlight preservation |
| `Standard` | Standard metering |
| `Backlight` | Optimized for backlit subjects |
| `Spotlight` | Optimized for spotlit subjects |

---

### `exposure_compensation`
**Type:** String  
**Description:** The exposure compensation value in EV (Exposure Value) steps

#### Format
```
[+/-]X.X EV
```

#### Examples
- `+2.0 EV` - Two stops brighter
- `+0.3 EV` - One-third stop brighter
- `0.0 EV` - No compensation
- `-0.7 EV` - Two-thirds stop darker
- `-3.0 EV` - Three stops darker

#### Range
Typically `-5.0 EV` to `+5.0 EV` in 1/3 or 1/2 stop increments, depending on camera model.

---

### `iso`
**Type:** String  
**Description:** The ISO sensitivity value

#### Possible Values
- Numeric values: `50`, `64`, `80`, `100`, `125`, `160`, `200`, `250`, `320`, `400`, `500`, `640`, `800`, `1000`, `1250`, `1600`, `2000`, `2500`, `3200`, `4000`, `5000`, `6400`, `8000`, `10000`, `12800`, `16000`, `20000`, `25600`, `32000`, `40000`, `51200`, `64000`, `80000`, `102400`, `128000`, `160000`, `204800`, `256000`, `409600`, etc.
- `AUTO` - Automatic ISO selection
- `ISO AUTO (xxx)` - Auto ISO with maximum limit

**Note:** Available ISO range depends on camera model. Extended ISO values may have an "H" or "L" designation (e.g., "ISO 102400 (H1)").

---

### `shutter_speed`
**Type:** String  
**Description:** The shutter speed

#### Format
Fast shutter speeds: `1/XXXX`  
Slow shutter speeds: `X"` or `X.X"`

#### Examples
- `1/8000` - Very fast (1/8000 second)
- `1/4000` - Fast
- `1/250` - Standard
- `1/60` - Moderate
- `1/30` - Slow
- `1"` - One second
- `2.5"` - 2.5 seconds
- `30"` - 30 seconds
- `BULB` - Bulb mode (manual control)

#### Typical Range
- Fastest: `1/8000` or `1/32000` (depending on camera model)
- Slowest: `30"` (30 seconds)
- Plus: `BULB` mode for exposures longer than 30 seconds

---

### `aperture`
**Type:** String  
**Description:** The lens aperture (f-number)

#### Format
```
F[number]
```

#### Examples
- `F1.4` - Wide aperture, shallow depth of field
- `F2.8` - Wide aperture
- `F5.6` - Mid-range aperture
- `F8.0` - Mid-range aperture
- `F11` - Narrow aperture
- `F16` - Narrow aperture, deep depth of field
- `F22` - Very narrow aperture

#### Notes
- Available apertures depend on the attached lens
- Wider apertures (smaller f-numbers like F1.4) let in more light
- Narrower apertures (larger f-numbers like F16) let in less light
- The format may vary: `F5.6`, `F/5.6`, or `5.6`

---

## Camera-Specific Notes

### Supported Features
Not all cameras support all features. The availability of certain modes and settings depends on:
- Camera model and generation
- Firmware version
- Current shooting mode
- Attached lens capabilities (for aperture)
- Battery level and camera state

### Property Availability
If a property is not supported or cannot be read, it may:
- Return `Unknown`
- Return an empty string
- Return a default/fallback value
- Be omitted from the JSON output (in future versions)

### Reading Frequency
Properties are read on-demand when `get_settings` is called. For real-time monitoring, you should:
- Call `get_settings` periodically (e.g., every 1-5 seconds)
- Avoid calling too frequently (may impact camera performance)
- Listen for camera state changes when available

---

## Example Use Cases

### Check if RAW is Enabled
```json
{
  "file_format": "RAW+JPEG"
}
```
If `file_format` contains "RAW", RAW capture is enabled.

### Determine Shooting Mode
```json
{
  "exposure_mode": {
	"current": "M_Manual"
  }
}
```
The camera is in full Manual mode.

### Check Subject Tracking
```json
{
  "subject_recognition_af": "On",
  "focus_mode": "AF-C",
  "focus_area": "Tracking_Wide"
}
```
Camera is tracking subjects with continuous autofocus across a wide area.

### Verify Memory Recall Usage
```json
{
  "memory_recall_available": true,
  "memory_recall_active": true,
  "exposure_mode": {
	"current": "M (Memory Recall)"
  }
}
```
A memory preset (M1/M2/M3) is currently active.

---

## Error Handling

### Connection Issues
If the camera is not connected or responds with an error, the command will output:
```
[ERROR] <error description>
```

### Incomplete Data
If certain properties cannot be read, they may show:
- `Unknown` as the value
- Empty string `""`
- Last known value (cached)

---

## Technical Details

### Data Types
- **String fields**: UTF-8 encoded strings
- **Boolean fields**: JSON boolean (`true` or `false`)
- **Numeric fields**: Formatted as strings for human readability

### JSON Encoding
- Output uses standard JSON formatting
- Strings are properly escaped
- UTF-8 encoding is used throughout
- Pretty-printed with 2-space indentation

### SDK Properties Mapped
| JSON Field | SDK Property Code |
|------------|-------------------|
| `exposure_mode` | `CrDeviceProperty_ExposureProgramMode` |
| `file_format` | `CrDeviceProperty_FileType` |
| `image_quality` | `CrDeviceProperty_StillImageQuality` |
| `image_size` | `CrDeviceProperty_ImageSize` |
| `aspect_ratio` | `CrDeviceProperty_AspectRatio` |
| `focus_mode` | `CrDeviceProperty_FocusMode` |
| `focus_area` | `CrDeviceProperty_FocusArea` |
| `subject_recognition_af` | `CrDeviceProperty_SubjectRecognitionInAF` |
| `touch_focus` | `CrDeviceProperty_FunctionOfTouchOperation` |
| `metering_mode` | `CrDeviceProperty_MeteringMode` |
| `exposure_compensation` | `CrDeviceProperty_ExposureBiasCompensation` |
| `iso` | `CrDeviceProperty_IsoSensitivity` |
| `shutter_speed` | `CrDeviceProperty_ShutterSpeed` |
| `aperture` | `CrDeviceProperty_FNumber` |

---

## Version History

### Version 1.0
- Initial implementation with all basic camera settings
- Exposure mode with available modes array
- Memory recall detection
- File format, quality, size, and aspect ratio
- Complete AF settings including subject recognition
- Touch focus status
- Metering mode
- Exposure compensation
- ISO, shutter speed, and aperture

---

## Future Enhancements

Potential additions in future versions:
- White balance information
- Picture profile/style
- Drive mode (single, continuous, bracket, etc.)
- Flash settings
- Video recording settings
- Battery level
- Remaining shots/recording time
- Custom button assignments
- More detailed memory recall info (if SDK provides)

---

## Support

For issues or questions:
- Check camera is properly connected
- Verify camera is in remote control mode
- Ensure latest firmware is installed on camera
- Consult Sony Camera Remote SDK documentation

---

*Last Updated: 2025*
