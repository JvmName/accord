import com.google.devtools.ksp.gradle.KspAATask
import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.ExperimentalKotlinGradlePluginApi
import org.jetbrains.kotlin.gradle.plugin.KotlinPlatformType

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.composeHotReload)
    alias(libs.plugins.kotlinParcelize)
    alias(libs.plugins.metro)
    alias(libs.plugins.poko)
    alias(libs.plugins.ksp)
    alias(libs.plugins.serialization)
}

kotlin {
    jvmToolchain(21)
    androidTarget {
    }

    jvm {
    }

    sourceSets {

        commonMain {
            kotlin.srcDir("build/generated/ksp/metadata/commonMain/kotlin")
            dependencies {
                implementation(libs.runtime)
                implementation(libs.foundation)
                implementation(libs.material3)
                implementation(libs.ui)
                implementation(libs.ui.tooling.preview)
                implementation(libs.compose.ui.tooling)
                implementation(libs.compose.ui.util)
                implementation(libs.material.icons)
                implementation(libs.kotlinx.coroutines.core)

                implementation(libs.circuit.foundation)
                implementation(libs.circuit.overlay)
                implementation(libs.circuitx.overlays)
                implementation(libs.circuitx.gestureNav)
                implementation(libs.circuit.annotations)

                implementation(libs.ktor.core)
                implementation(libs.ktor.negotiation)
                implementation(libs.ktor.json)
                implementation(libs.ktor.websockets)
                implementation(libs.serialization.json)
                implementation(libs.androidx.datastore)

                implementation(libs.kotlin.result)
                implementation(libs.kotlin.result.coroutines)
            }
        }

        androidMain.dependencies {
            implementation(libs.ui.tooling.preview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.compose.ui.tooling)
            implementation(libs.kotlinx.coroutines.android)
            implementation(libs.ktor.client.okhttp)
            implementation(libs.circuitx.android)
        }
        jvmMain.dependencies {
            implementation(compose.desktop.currentOs)
            implementation(libs.kotlinx.coroutines.swing)
            implementation(libs.ktor.client.okhttp)
        }

        configureEach {
            @OptIn(ExperimentalKotlinGradlePluginApi::class)
            compilerOptions {
                progressiveMode = true
                optIn.addAll(
                    "kotlin.contracts.ExperimentalContracts",
                    "androidx.compose.material.ExperimentalMaterialApi",
                    "androidx.compose.material3.ExperimentalMaterial3Api",
                    "androidx.compose.ui.ExperimentalComposeUiApi",
                    "kotlinx.serialization.ExperimentalSerializationApi",
                    "kotlin.concurrent.atomics.ExperimentalAtomicApi",
                )
                freeCompilerArgs.addAll(
                    "-Xexpect-actual-classes",
                    "-Xcontext-sensitive-resolution",
                )
            }
        }

        targets.configureEach {
            if (platformType == KotlinPlatformType.androidJvm) {
                compilations.configureEach {
                    compileTaskProvider.configure {
                        compilerOptions {
                            freeCompilerArgs.addAll(
                                "-P",
                                "plugin:org.jetbrains.kotlin.parcelize:additionalAnnotation=dev.jvmname.accord.parcel.CommonParcelize",
                            )
                        }
                    }
                }
            }
        }
    }
}

android {
    namespace = "dev.jvmname.accord"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "dev.jvmname.accord"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21

    }
}


tasks.withType<JavaCompile>().configureEach {
    // Only configure kotlin/jvm tasks with this
    if (name.startsWith("compileJvm")) {
        options.release.set(21)
    }
}

compose.desktop {
    application {
        mainClass = "dev.jvmname.accord.MainKt"

        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Deb)
            packageName = "dev.jvmname.accord"
            packageVersion = "1.0.0"
        }
    }
}

ksp { arg("circuit.codegen.mode", "metro") }

dependencies {
    add("kspCommonMainMetadata", libs.circuit.codegen)
//    add("kspAndroid", libs.circuit.codegen)
//    add("kspJvm", libs.circuit.codegen)
}

tasks.withType<KspAATask>().configureEach {
    if (name != "kspCommonMainKotlinMetadata") {
        dependsOn("kspCommonMainKotlinMetadata")
    }
}