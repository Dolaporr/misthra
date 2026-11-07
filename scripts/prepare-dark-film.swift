import Foundation
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

// Key only pale pixels connected to the frame's exterior. Enclosed highlights
// remain in the figure, unlike a luminance key applied to the whole image.
func darkStage(_ pixels: UnsafeMutablePointer<UInt8>, _ width: Int, _ height: Int, _ stride: Int) {
    let count = width * height
    var visited = [UInt8](repeating: 0, count: count)
    var queue = [Int32](repeating: 0, count: count)
    var end = 0
    func pale(_ index: Int) -> Bool {
        let offset = (index / width) * stride + (index % width) * 4
        let b = Int(pixels[offset]), g = Int(pixels[offset + 1]), r = Int(pixels[offset + 2])
        return min(b, min(g, r)) > 145 && max(b, max(g, r)) - min(b, min(g, r)) < 65
    }
    func enqueue(_ index: Int) {
        if visited[index] == 0 && pale(index) {
            visited[index] = 1
            queue[end] = Int32(index)
            end += 1
        }
    }
    for x in 0..<width { enqueue(x); enqueue((height - 1) * width + x) }
    for y in 0..<height { enqueue(y * width); enqueue(y * width + width - 1) }
    var start = 0
    while start < end {
        let index = Int(queue[start]); start += 1
        let x = index % width, y = index / width
        if x > 0 { enqueue(index - 1) }
        if x + 1 < width { enqueue(index + 1) }
        if y > 0 { enqueue(index - width) }
        if y + 1 < height { enqueue(index + width) }
    }
    let lift = (0...255).map { UInt8(min(255, pow(Double($0) / 255, 0.84) * 255 * 1.1)) }
    for index in 0..<count {
        let offset = (index / width) * stride + (index % width) * 4
        if visited[index] != 0 {
            pixels[offset] = 22; pixels[offset + 1] = 15; pixels[offset + 2] = 12
        } else {
            pixels[offset] = lift[Int(pixels[offset])]
            pixels[offset + 1] = lift[Int(pixels[offset + 1])]
            pixels[offset + 2] = lift[Int(pixels[offset + 2])]
        }
        pixels[offset + 3] = 255
    }
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let directory = root.appendingPathComponent("public/media")
for (name, width, height, bitrate) in [("desktop",1920,1080,4_000_000),("mobile",960,540,1_400_000)] {
    let asset = AVURLAsset(url: directory.appendingPathComponent("misthra-agent-\(name).mp4"))
    let track = try await asset.loadTracks(withMediaType: .video)[0]
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
    reader.add(output)
    let url = directory.appendingPathComponent("misthra-agent-dark-\(name).mp4")
    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey:AVVideoCodecType.h264, AVVideoWidthKey:width, AVVideoHeightKey:height, AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:bitrate, AVVideoMaxKeyFrameIntervalKey:1, AVVideoAllowFrameReorderingKey:false, AVVideoExpectedSourceFrameRateKey:24]])
    input.expectsMediaDataInRealTime = false
    writer.add(input)
    guard writer.startWriting(), reader.startReading() else { throw writer.error ?? reader.error ?? NSError(domain:"Misthra",code:1) }
    writer.startSession(atSourceTime: .zero)
    var frames = 0
    while let sample = output.copyNextSampleBuffer() {
        if let buffer = CMSampleBufferGetImageBuffer(sample) {
            CVPixelBufferLockBaseAddress(buffer, [])
            if let address = CVPixelBufferGetBaseAddress(buffer) {
                darkStage(address.assumingMemoryBound(to: UInt8.self), CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer), CVPixelBufferGetBytesPerRow(buffer))
            }
            CVPixelBufferUnlockBaseAddress(buffer, [])
        }
        while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds:2_000_000) }
        guard input.append(sample) else { throw writer.error ?? NSError(domain:"Misthra",code:2) }
        frames += 1
    }
    guard reader.status == .completed else { throw reader.error ?? NSError(domain:"Misthra",code:3) }
    input.markAsFinished()
    await withCheckedContinuation { (continuation:CheckedContinuation<Void,Never>) in writer.finishWriting { continuation.resume() } }
    guard writer.status == .completed else { throw writer.error ?? NSError(domain:"Misthra",code:4) }
    print(name, "frames", frames, "bytes", try FileManager.default.attributesOfItem(atPath:url.path)[.size]!)
    if name == "desktop" {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url:url))
        generator.appliesPreferredTrackTransform = true
        let frame = (try await generator.image(at:.zero)).image
        let poster = directory.appendingPathComponent("misthra-agent-dark-poster.jpg")
        guard let destination = CGImageDestinationCreateWithURL(poster as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { throw NSError(domain:"Misthra",code:5) }
        CGImageDestinationAddImage(destination, frame, [kCGImageDestinationLossyCompressionQuality:0.93] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw NSError(domain:"Misthra",code:6) }
    }
}
