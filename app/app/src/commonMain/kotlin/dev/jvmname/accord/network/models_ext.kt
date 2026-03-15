package dev.jvmname.accord.network

import androidx.compose.ui.util.fastFirst

val Mat.adminCode: MatCode
    get() = codes.fastFirst { it.role == Role.ADMIN }