@file:OptIn(
    DelicateMetroGradleApi::class,
    ExperimentalKotlinGradlePluginApi::class,
    ExperimentalWasmDsl::class
)

import com.google.devtools.ksp.gradle.KspAATask
import dev.zacsweers.metro.gradle.DelicateMetroGradleApi
import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.ExperimentalKotlinGradlePluginApi
import org.jetbrains.kotlin.gradle.ExperimentalWasmDsl
import org.jetbrains.kotlin.gradle.dsl.KotlinJsCompile
import org.jetbrains.kotlin.gradle.plugin.KotlinPlatformType

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.composeHotReload)
    alias(libs.plugins.kotlinParcelize)
    alias(libs.plugins.metro)
    alias(libs.plugins.poko)
    alias(libs.plugins.ksp)
    alias(libs.plugins.serialization)
    alias(libs.plugins.buildconfig)
}

kotlin {
    jvmToolchain(21)
    android {
        namespace = "dev.jvmname.accord.lib"
        compileSdk = libs.versions.android.compileSdk.get().toInt()
        minSdk = libs.versions.android.minSdk.get().toInt()
        androidResources {
            enable = true
        }
    }

    jvm {}

    wasmJs {
        browser()
        binaries.executable()
    }


    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain {
            kotlin.srcDir("build/generated/ksp/metadata/commonMain/kotlin")
            dependencies {
                implementation(libs.runtime)
                implementation(libs.foundation)
                implementation(libs.material3)
                implementation(libs.ui)
                implementation(libs.ui.tooling.preview)
//                implementation(libs.compose.ui.tooling)
                implementation(libs.compose.ui.util)
                implementation(libs.material.icons)
                implementation(libs.kotlinx.coroutines.core)

                api(libs.circuit.foundation)
                implementation(libs.circuit.overlay)
                implementation(libs.circuitx.overlays)
                implementation(libs.circuitx.gestureNav)
                implementation(libs.circuit.annotations)

                implementation(libs.ktor.core)
                implementation(libs.ktor.negotiation)
                implementation(libs.ktor.json)
                implementation(libs.ktor.logging)
                implementation(libs.serialization.json)
                implementation(libs.androidx.datastore)

                implementation(libs.kotlin.result)
                implementation(libs.kotlin.result.coroutines)
                implementation(libs.kotlin.result.retry)

                implementation(libs.multihaptic)
                implementation(libs.kermit)
                implementation(libs.sound)
                implementation(libs.composeResources)
            }
        }

        val commonJvm by creating {
            dependsOn(commonMain.get())
            dependencies {
                implementation(libs.socketio.client.jvm)
                implementation(libs.ktor.client.okhttp)
                implementation(libs.ui.tooling.preview)
                implementation(libs.compose.ui.tooling)
            }
        }

        jvmMain {
            dependsOn(commonJvm)
            dependencies {
                implementation(compose.desktop.currentOs)
                implementation(libs.kotlinx.coroutines.swing)
            }
        }

        androidMain {
            dependsOn(commonJvm)
            dependencies {
                implementation(libs.androidx.activity.compose)
                implementation(libs.kotlinx.coroutines.android)
                implementation(libs.circuitx.android)
            }
        }

        wasmJsMain {
//            dependsOn(commonMain.get())
            dependencies {
                implementation(npm("socket.io-client", "4.8.3"))
            }

        }

        commonTest {
            dependencies {
                implementation(kotlin("test"))
                implementation(libs.kotlinx.coroutines.test)
            }
        }

        val wasmJsTest by getting {
            dependencies {
                implementation(kotlin("test"))
            }
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
                    "kotlinx.serialization.InternalSerializationApi",
                    "androidx.compose.material.ExperimentalMaterial3ExpressiveApi",
                    "androidx.compose.material3.ExperimentalMaterial3ExpressiveApi",
                    "app.lexilabs.basic.sound.ExperimentalBasicSound",
                    "org.jetbrains.compose.resources.ExperimentalResourceApi",
                )
                freeCompilerArgs.addAll(
                    "-Xexpect-actual-classes",
                    "-Xcontext-sensitive-resolution",
                    "-Xwasm-use-new-exception-proposal"
                )
            }
        }

        targets.configureEach {
            if (platformType != KotlinPlatformType.androidJvm) return@configureEach
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

tasks.withType<JavaCompile>().configureEach {
    // Only configure kotlin/jvm tasks with this
    if (name.startsWith("compileJvm")) {
        options.release.set(21)
    }
}

tasks.withType<KotlinJsCompile>().configureEach{
    compilerOptions {
        target = "2015"
    }
}

compose {
    resources {
        publicResClass = true
        generateResClass = always
        packageOfResClass = "dev.jvmname.accord.shared.resources"
    }
    desktop {
        application {
            mainClass = "dev.jvmname.accord.MainKt"

            nativeDistributions {
                targetFormats(TargetFormat.Dmg, TargetFormat.Deb)
                packageName = "dev.jvmname.accord"
                packageVersion = "1.0.0"
            }
        }
    }
}

ksp {
    arg("circuit.codegen.mode", "metro")
}

metro {
    contributesAsInject = true
    enableCircuitCodegen = false
    compilerOptions {
//        enable("enable-full-binding-graph-validation")
    }

}


dependencies {
    add("kspCommonMainMetadata", libs.circuit.codegen)
}

tasks.withType<KspAATask>().configureEach {
    if (name != "kspCommonMainKotlinMetadata") {
        dependsOn("kspCommonMainKotlinMetadata")
    }
}

val isRelease = providers.gradleProperty("release").isPresent
val versionName = providers.gradleProperty("VERSION_NAME").get()
buildConfig {
    useKotlinOutput()
    documentation.set("Generated by BuildConfig plugin")

    buildConfigField("DEBUG", !isRelease)
    buildConfigField("VERSION_NAME", versionName)
    buildConfigField("BASE_URL", expect<String>())

    sourceSets.named("jvmMain") {
        buildConfigField(
            "BASE_URL",
            if (isRelease) "https://rdk.api.jvmname.dev" else "http://localhost:3000"
        )
    }

    sourceSets.named("androidMain") {
        buildConfigField(
            "BASE_URL",
            if (isRelease) "https://rdk.api.jvmname.dev" else "http://[fec0::2]:3000"
        )
    }

    sourceSets.named("wasmJsMain") {
        buildConfigField(
            "BASE_URL",
            if (isRelease) "https://rdk.api.jvmname.dev" else "http://localhost:3000"
        )
    }
}