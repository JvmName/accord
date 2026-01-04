##---------------Begin: General ---------------
# Keep source file names and line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*
-allowaccessmodification
-dontusemixedcaseclassnames
##---------------End: General ---------------

# Ensure the custom, fast service loader implementation is removed. R8 will fold these for us
-assumenosideeffects class kotlinx.coroutines.internal.MainDispatcherLoader {
    boolean FAST_SERVICE_LOADER_ENABLED return false;
}
-assumenosideeffects class kotlinx.coroutines.internal.FastServiceLoader {
    boolean ANDROID_DETECTED return true;
}
-checkdiscard class kotlinx.coroutines.internal.FastServiceLoader

# With R8 full mode generic signatures are stripped for classes that are not
# kept. Suspend functions are wrapped in continuations where the type argument
# is used.
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation

##---------------Begin: Application-Specific Rules ---------------
# Annotation-based rules for your application classes

# Keep all @Serializable annotated classes (kotlinx.serialization handles its own runtime)
-keep @kotlinx.serialization.Serializable class dev.jvmname.accord.** { *; }
-keep,includedescriptorclasses class dev.jvmname.accord.**$$serializer { *; }

# Keep all @Poko annotated classes (if library doesn't ship consumer rules)
-keep @dev.drewhamilton.poko.Poko class dev.jvmname.accord.** { *; }

# Keep all @CommonParcelize annotated classes
-keep @dev.jvmname.accord.parcel.CommonParcelize class dev.jvmname.accord.** { *; }

# Keep all Circuit Screen implementations
-keep class * implements com.slack.circuit.runtime.screen.Screen { *; }

# Keep all enums in the project
-keepclassmembers enum dev.jvmname.accord.** { *; }

# Keep WebSocket message types (for future serialization)
-keep interface dev.jvmname.accord.network.SocketReceiveInfo { *; }
-keep class * implements dev.jvmname.accord.network.SocketReceiveInfo { *; }
##---------------End: Application-Specific Rules ---------------
