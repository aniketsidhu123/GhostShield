"""Measure interactive regions in the supplied video; original media is never modified.

Requires Python, OpenCV and NumPy. Points are tracked from the actual video, so
the React hotspots follow the decoded frame rather than guessed scroll progress.
"""
import json
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
cap = cv2.VideoCapture(str(ROOT / 'Frontend video.mp4'))
fps = cap.get(cv2.CAP_PROP_FPS)
frames = []
while True:
    ok, frame = cap.read()
    if not ok:
        break
    frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
cap.release()

def track_rect(rect, start, end):
    """Follow feature points in each region, with robust affine estimation."""
    x, y, w, h = rect
    corners = np.array([[x, y], [x+w, y], [x+w, y+h], [x, y+h]], np.float32)
    keys = []
    for frame_index in range(start, end + 1):
        x, y = np.min(corners, axis=0)
        right, bottom = np.max(corners, axis=0)
        keys.append([round(frame_index/fps, 5), *[round(float(v), 2) for v in [x, y, right-x, bottom-y]]])
        if frame_index == end:
            break
        mask = np.zeros_like(frames[frame_index])
        cv2.fillConvexPoly(mask, corners.astype(np.int32), 255)
        points = cv2.goodFeaturesToTrack(frames[frame_index], 100, .025, 5, mask=mask)
        if points is None or len(points) < 4:
            continue
        next_points, status, _ = cv2.calcOpticalFlowPyrLK(
            frames[frame_index], frames[frame_index+1], points, None,
            winSize=(25, 25), maxLevel=3,
        )
        good = status.flatten() == 1
        if good.sum() < 4:
            continue
        matrix, _ = cv2.estimateAffinePartial2D(points[good], next_points[good], method=cv2.RANSAC, ransacReprojThreshold=2)
        if matrix is not None:
            corners = cv2.transform(corners[None, :, :], matrix)[0]
    return keys

cards = [
    ('verified-left', 'active', 'Verified listing', [150, 201, 105, 110]),
    ('active-upper-left', 'active', 'Active listing', [275, 144, 71, 73]),
    ('ghost-center-left', 'ghost', 'Ghost listing', [322, 276, 112, 113]),
    ('ghost-upper', 'ghost', 'Ghost listing', [467, 159, 97, 100]),
    ('scam-center', 'scam', 'Scam signal listing', [575, 294, 115, 124]),
    ('verified-upper', 'active', 'Verified listing', [733, 169, 74, 78]),
    ('scam-upper', 'scam', 'Scam signal listing', [877, 214, 79, 86]),
    ('ghost-right', 'ghost', 'Ghost listing', [803, 329, 65, 73]),
    ('active-right', 'active', 'Active listing', [1019, 309, 88, 87]),
    ('verified-lower', 'active', 'Verified listing', [846, 420, 126, 130]),
    ('warning-lower', 'scam', 'Warning listing', [750, 479, 75, 81]),
    ('ghost-lower-left', 'ghost', 'Ghost listing', [177, 415, 108, 118]),
    ('listing-center', 'ghost', 'Unverified job listing', [498, 483, 108, 116]),
    ('listing-left', 'ghost', 'Unverified job listing', [32, 366, 95, 99]),
    ('ghost-foreground', 'ghost', 'Foreground ghost listing', [1020, 0, 260, 226]),
    ('verified-foreground', 'active', 'Foreground verified listing', [1041, 546, 221, 174]),
    ('listing-lower-left', 'ghost', 'Unverified job listing', [194, 612, 184, 108]),
    ('ghost-small', 'ghost', 'Small ghost listing', [468, 318, 59, 58]),
    ('listing-lower', 'ghost', 'Unverified job listing', [988, 585, 89, 126]),
]
data = {'width': 1280, 'height': 720, 'fps': fps, 'duration': len(frames)/fps, 'cards': []}
for id, scenario, label, rect in cards:
    data['cards'].append({'id': id, 'scenario': scenario, 'label': label, 'frames': track_rect(rect, 0, 78)})

# The scanner arrives at 7.75s; all visible foreground controls are then stable
# enough to interact with. Track the slight final camera pull-back as well.
start = 198 # frame at 8.25s used as an accurately measured anchor
scanner = {
    'form': [356, 318, 568, 75],
    'ghostDial': [72, 231, 260, 243],
    'scamDial': [972, 232, 241, 243],
}
# Tracking backwards uses the same estimator on a reversed frame sequence.
for name, rect in scanner.items():
    forward = track_rect(rect, start, 239)
    original_frames = frames
    frames = original_frames[::-1]
    backward = track_rect(rect, len(frames)-1-start, len(frames)-1-186)
    frames = original_frames
    backward = [[round((len(frames)-1)/fps-item[0], 5), *item[1:]] for item in backward]
    data[name] = sorted(backward[1:] + forward, key=lambda point: point[0])

(ROOT / 'src/data/videoTracking.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print(f'Tracked {len(cards)} cards and 3 scanner regions in {len(frames)} source frames.')
