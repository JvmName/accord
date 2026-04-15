import com.google.devtools.ksp.gradle.KspAATask
import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.ExperimentalKotlinGradlePluginApi
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
        namespace = "dev.jvmname.accord"
        compileSdk = libs.versions.android.compileSdk.get().toInt()
        minSdk = libs.versions.android.minSdk.get().toInt()
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
                implementation(libs.socketio.client)
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

        commonTest {
            dependencies {
                implementation(kotlin("test"))
                implementation(libs.kotlinx.coroutines.test)
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

tasks.withType<JavaCompile>().configureEach {
    // Only configure kotlin/jvm tasks with this
    if (name.startsWith("compileJvm")) {
        options.release.set(21)
    }
}

compose{
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

ksp { arg("circuit.codegen.mode", "metro") }
@Suppress("OPT_IN_USAGE")
metro {
    contributesAsInject = true
    enableFullBindingGraphValidation = true
}


val isRelease = providers.gradleProperty("release").isPresent
buildConfig {
    useKotlinOutput()
    documentation.set("Generated by BuildConfig plugin")

    buildConfigField("DEBUG", !isRelease)

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

}

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