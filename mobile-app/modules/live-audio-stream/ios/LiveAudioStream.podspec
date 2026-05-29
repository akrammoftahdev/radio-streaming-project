Pod::Spec.new do |s|
  s.name           = 'LiveAudioStream'
  s.version        = '1.0.0'
  s.summary        = 'AVAudioEngine-based live audio streaming for Expo'
  s.description    = 'Custom Expo native module that uses AVAudioEngine installTap for continuous PCM audio streaming'
  s.homepage       = 'https://egonair.com'
  s.license        = 'MIT'
  s.author         = 'Akram Developments'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.source_files   = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.4'
end
